import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CronClickhouseService {
  private readonly logger = new Logger(CronClickhouseService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Every hour — sync completed sales to ClickHouse (no-op when unconfigured). */
  @Cron("0 * * * *", { name: "clickhouse-sync" })
  async clickhouseSync(): Promise<void> {
    if (!process.env["CLICKHOUSE_URL"]?.trim()) return;
    this.logger.log("Running clickhouse-sync");
    try {
      const result = await this.runClickhouseSync();
      this.logger.log(`Synced ${result.sales} sales, ${result.items} items`);
    } catch (err) {
      this.logger.error("clickhouse-sync failed", err);
    }
  }

  async runClickhouseSync() {
    if (!process.env["CLICKHOUSE_URL"]?.trim()) {
      return { skipped: true, reason: "CLICKHOUSE_URL not set", ranAt: new Date().toISOString() };
    }

    // Dynamically import to avoid loading ClickHouse client when unconfigured
    const { createClient } = await import("@clickhouse/client");

    const url = process.env["CLICKHOUSE_URL"]!;
    const username = process.env["CLICKHOUSE_USER"] ?? "pryrox";
    const password = process.env["CLICKHOUSE_PASSWORD"] ?? "pryrox_dev";
    const database = process.env["CLICKHOUSE_DATABASE"] ?? "pryrox_analytics";

    const ch = createClient({ url, username, password, database });

    try {
      const since = await this.getWatermark(ch, database);
      let salesCount = 0;
      let itemsCount = 0;
      let maxUpdated = since;
      let lastId: string | undefined;
      let lastUpdated = since;
      const BATCH = 500;

      for (;;) {
        const rows = await this.prisma.sales.findMany({
          where: {
            pharmacy_id: { not: null },
            OR: [
              { updated_at: { gt: lastUpdated } },
              { updated_at: lastUpdated, ...(lastId ? { id: { gt: lastId } } : {}) },
            ],
          },
          orderBy: [{ updated_at: "asc" }, { id: "asc" }],
          take: BATCH,
          include: {
            sale_items: {
              include: { inventory: { select: { medications: { select: { category: true } } } } },
            },
          },
        });

        if (!rows.length) break;

        const salesValues = rows
          .filter((r) => r.pharmacy_id && r.created_at)
          .map((r) => {
            const total = Number(r.total_amount ?? 0);
            const insurance = Number(r.insurance_amount ?? 0);
            return {
              sale_id: r.id,
              pharmacy_id: r.pharmacy_id!,
              branch_id: r.branch_id ?? "00000000-0000-0000-0000-000000000000",
              created_at: r.created_at!.toISOString().replace("T", " ").replace("Z", ""),
              total_amount: total.toFixed(2),
              insurance_amount: insurance.toFixed(2),
              customer_amount: Math.max(0, total - insurance).toFixed(2),
              payment_method: r.payment_method ?? "cash",
              status: r.status ?? "completed",
            };
          });

        if (salesValues.length > 0) {
          await ch.insert({ table: `${database}.sales_fact`, values: salesValues, format: "JSONEachRow" });
          salesCount += salesValues.length;
        }

        // Sync sale items for category analytics
        const itemValues = rows.flatMap((r) =>
          r.sale_items
            .filter((item) => item.id && r.pharmacy_id && r.created_at)
            .map((item) => ({
              sale_item_id: item.id,
              sale_id: r.id,
              pharmacy_id: r.pharmacy_id!,
              branch_id: r.branch_id ?? "00000000-0000-0000-0000-000000000000",
              sold_at: r.created_at!.toISOString().replace("T", " ").replace("Z", ""),
              medication_name: item.medication_name ?? "Unknown",
              category: item.inventory?.medications?.category ?? "general",
              quantity: item.quantity ?? 1,
              unit_price: Number(item.unit_price ?? 0).toFixed(2),
              total_price: Number(item.total_price ?? 0).toFixed(2),
            }))
        );

        if (itemValues.length > 0) {
          await ch.insert({ table: `${database}.sale_items_fact`, values: itemValues, format: "JSONEachRow" });
          itemsCount += itemValues.length;
        }

        const last = rows[rows.length - 1]!;
        if (last.updated_at) {
          lastUpdated = last.updated_at;
          if (last.updated_at > maxUpdated) maxUpdated = last.updated_at;
        }
        lastId = last.id;
        if (rows.length < BATCH) break;
      }

      if (salesCount > 0) await this.setWatermark(ch, database, maxUpdated, salesCount);

      return { sales: salesCount, items: itemsCount, watermark: maxUpdated.toISOString(), ranAt: new Date().toISOString() };
    } finally {
      await ch.close();
    }
  }

  private async getWatermark(ch: any, database: string): Promise<Date> {
    try {
      const result = await ch.query({
        query: `SELECT max(last_synced_at) AS ts FROM ${database}.sync_state WHERE stream = {stream:String}`,
        query_params: { stream: "sales" },
        format: "JSONEachRow",
      });
      const rows = (await result.json()) as Array<{ ts: string | null }>;
      const raw = rows[0]?.ts;
      if (!raw || raw.startsWith("1970")) return new Date(0);
      return new Date(raw);
    } catch {
      return new Date(0);
    }
  }

  private async setWatermark(ch: any, database: string, at: Date, rowsSynced: number): Promise<void> {
    try {
      await ch.insert({
        table: `${database}.sync_state`,
        values: [{ stream: "sales", last_synced_at: at.toISOString().replace("T", " ").replace("Z", ""), rows_synced: rowsSynced }],
        format: "JSONEachRow",
      });
    } catch { /* non-fatal */ }
  }
}
