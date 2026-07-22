import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type ClickhouseClient = import("@clickhouse/client").ClickHouseClient;

@Injectable()
export class ClickhouseService implements OnModuleDestroy {
  private readonly logger = new Logger(ClickhouseService.name);
  private client: ClickhouseClient | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    const url = this.config.get<string>("CLICKHOUSE_URL") ?? process.env["CLICKHOUSE_URL"];
    return Boolean(url?.trim());
  }

  private getConfig() {
    const url = (this.config.get<string>("CLICKHOUSE_URL") ?? process.env["CLICKHOUSE_URL"] ?? "http://localhost:8123").trim();
    const username = (this.config.get<string>("CLICKHOUSE_USER") ?? process.env["CLICKHOUSE_USER"] ?? "pryrox").trim();
    const password = this.config.get<string>("CLICKHOUSE_PASSWORD") ?? process.env["CLICKHOUSE_PASSWORD"] ?? "pryrox_dev";
    const database = (this.config.get<string>("CLICKHOUSE_DATABASE") ?? process.env["CLICKHOUSE_DATABASE"] ?? "pryrox_analytics").trim();
    return { url, username, password, database };
  }

  async getClient(): Promise<ClickhouseClient | null> {
    if (!this.isConfigured()) return null;
    if (this.client) return this.client;
    try {
      const { createClient } = await import("@clickhouse/client");
      const cfg = this.getConfig();
      this.client = createClient({ url: cfg.url, username: cfg.username, password: cfg.password, database: cfg.database });
      return this.client;
    } catch {
      return null;
    }
  }

  async query<T>(sql: string): Promise<T[]> {
    const ch = await this.getClient();
    if (!ch) return [];
    try {
      const result = await ch.query({ query: sql, format: "JSONEachRow" });
      return (await result.json()) as T[];
    } catch (err) {
      this.logger.warn(`ClickHouse query failed, falling back to Postgres: ${err}`);
      return [];
    }
  }

  get database(): string {
    return this.getConfig().database;
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.close().catch(() => {});
      this.client = null;
    }
  }

  // ── Daily revenue ────────────────────────────────────────────────────────────

  async getDailyRevenue(pharmacyId: string, days = 90): Promise<Array<{ day: string; revenue: number; orders: number }>> {
    const db = this.database;
    const rows = await this.query<{ day: string; revenue: string; orders: string }>(
      `SELECT toString(day) as day, toString(sum(revenue)) as revenue, toString(sum(orders)) as orders
       FROM ${db}.daily_sales_agg
       WHERE pharmacy_id = '${pharmacyId}' AND day >= today() - ${days}
       GROUP BY day ORDER BY day ASC`
    );
    return rows.map((r) => ({ day: r.day, revenue: Math.round(Number(r.revenue)), orders: Number(r.orders) }));
  }

  // ── Category revenue ─────────────────────────────────────────────────────────

  async getCategoryRevenue(pharmacyId: string, fromDay?: string, toDay?: string): Promise<Array<{ category: string; revenue: number; quantity: number }>> {
    const db = this.database;
    const dateFilter = fromDay && toDay ? `AND day BETWEEN '${fromDay}' AND '${toDay}'` : `AND day >= today() - 30`;
    const rows = await this.query<{ category: string; revenue: string; quantity: string }>(
      `SELECT category, toString(sum(revenue)) as revenue, toString(sum(quantity)) as quantity
       FROM ${db}.category_sales_agg
       WHERE pharmacy_id = '${pharmacyId}' ${dateFilter}
       GROUP BY category ORDER BY revenue DESC`
    );
    return rows.map((r) => ({ category: r.category, revenue: Math.round(Number(r.revenue)), quantity: Number(r.quantity) }));
  }

  // ── Sales summary ────────────────────────────────────────────────────────────

  async getSalesSummary(pharmacyId: string, fromDay: string, toDay: string, branchId?: string): Promise<{ totalRevenue: number; totalOrders: number; dailySales: Array<{ day: string; revenue: number; orders: number }> }> {
    const db = this.database;
    const branchFilter = branchId ? `AND branch_id = '${branchId}'` : "";
    const rows = await this.query<{ day: string; revenue: string; orders: string }>(
      `SELECT toString(day) as day, toString(sum(revenue)) as revenue, toString(sum(orders)) as orders
       FROM ${db}.daily_sales_agg
       WHERE pharmacy_id = '${pharmacyId}' AND day BETWEEN '${fromDay}' AND '${toDay}' ${branchFilter}
       GROUP BY day ORDER BY day ASC`
    );
    const dailySales = rows.map((r) => ({ day: r.day, revenue: Math.round(Number(r.revenue)), orders: Number(r.orders) }));
    return {
      totalRevenue: dailySales.reduce((s, r) => s + r.revenue, 0),
      totalOrders: dailySales.reduce((s, r) => s + r.orders, 0),
      dailySales,
    };
  }

  // ── Today revenue ────────────────────────────────────────────────────────────

  async getTodayRevenue(pharmacyId: string, branchId?: string): Promise<number> {
    const db = this.database;
    const branchFilter = branchId ? `AND branch_id = '${branchId}'` : "";
    const rows = await this.query<{ revenue: string }>(
      `SELECT toString(sum(revenue)) as revenue
       FROM ${db}.daily_sales_agg
       WHERE pharmacy_id = '${pharmacyId}' AND day = today() ${branchFilter}`
    );
    return Math.round(Number(rows[0]?.revenue ?? 0));
  }

  // ── Top medications ──────────────────────────────────────────────────────────

  async getTopMedications(pharmacyId: string, fromDay: string, toDay: string, limit = 8): Promise<Array<{ medication_name: string; revenue: number; quantity: number }>> {
    const db = this.database;
    const rows = await this.query<{ medication_name: string; revenue: string; quantity: string }>(
      `SELECT medication_name,
              toString(sum(total_price)) as revenue,
              toString(sum(quantity)) as quantity
       FROM ${db}.sale_items_fact
       WHERE pharmacy_id = '${pharmacyId}'
         AND toDate(sold_at) BETWEEN '${fromDay}' AND '${toDay}'
       GROUP BY medication_name
       ORDER BY revenue DESC
       LIMIT ${limit}`
    );
    return rows.map((r) => ({ medication_name: r.medication_name, revenue: Math.round(Number(r.revenue)), quantity: Number(r.quantity) }));
  }

  // ── Insurance monthly summary ────────────────────────────────────────────────

  async getInsuranceMonthlySummary(pharmacyId: string, months = 12): Promise<Array<{ month: string; insuranceRevenue: number; customerRevenue: number; totalRevenue: number; insuranceSharePercent: number }>> {
    const db = this.database;
    const rows = await this.query<{ month: string; insurance: string; customer: string; total: string }>(
      `SELECT toString(toStartOfMonth(day)) AS month,
              toString(sum(insurance_revenue)) AS insurance,
              toString(sum(customer_revenue)) AS customer,
              toString(sum(revenue)) AS total
       FROM ${db}.daily_sales_agg
       WHERE pharmacy_id = '${pharmacyId}'
         AND day >= toStartOfMonth(now() - toIntervalMonth(${months}))
       GROUP BY month
       ORDER BY month ASC`
    );
    return rows.map((r) => {
      const total = Math.round(Number(r.total));
      const insurance = Math.round(Number(r.insurance));
      return {
        month: r.month.slice(0, 7),
        insuranceRevenue: insurance,
        customerRevenue: Math.round(Number(r.customer)),
        totalRevenue: total,
        insuranceSharePercent: total > 0 ? Math.round((insurance / total) * 100) : 0,
      };
    });
  }

  // ── Payment method split ─────────────────────────────────────────────────────

  async getPaymentMethodSplit(pharmacyId: string, fromDay: string, toDay: string, branchId?: string): Promise<{ insuranceTotal: number; cashTotal: number; otherTotal: number; total: number }> {
    const db = this.database;
    const branchFilter = branchId ? `AND branch_id = '${branchId}'` : "";
    const rows = await this.query<{ insurance: string; customer: string; total: string }>(
      `SELECT toString(sum(insurance_revenue)) AS insurance,
              toString(sum(customer_revenue)) AS customer,
              toString(sum(revenue)) AS total
       FROM ${db}.daily_sales_agg
       WHERE pharmacy_id = '${pharmacyId}'
         AND day BETWEEN '${fromDay}' AND '${toDay}'
         ${branchFilter}`
    );
    const row = rows[0];
    const total = Math.round(Number(row?.total ?? 0));
    const insurance = Math.round(Number(row?.insurance ?? 0));
    const customer = Math.round(Number(row?.customer ?? 0));
    return {
      insuranceTotal: insurance,
      cashTotal: customer,
      otherTotal: Math.max(0, total - insurance - customer),
      total,
    };
  }
}

