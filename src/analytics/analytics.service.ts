import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ClickhouseService } from "../clickhouse/clickhouse.service";

function decimal(value: unknown): number {
  if (value == null) return 0;
  return Number(value);
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function sumSales(rows: Array<{ total_amount: unknown }>): number {
  return rows.reduce((sum, row) => sum + decimal(row.total_amount), 0);
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ch: ClickhouseService,
  ) {}

  async dashboard(pharmacyId: string) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // ── ClickHouse fast path ───────────────────────────────────────────────────
    if (this.ch.isConfigured()) {
      try {
        const fromDay = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const toDay = now.toISOString().slice(0, 10);
        const from30 = thirtyDaysAgo.toISOString().slice(0, 10);

        const [dailyRows, categoryRows, topMeds, customerCount, newCustomers] = await Promise.all([
          this.ch.getDailyRevenue(pharmacyId, 90),
          this.ch.getCategoryRevenue(pharmacyId, from30, toDay),
          this.ch.getTopMedications(pharmacyId, from30, toDay, 5),
          this.prisma.customers.count({ where: { pharmacy_id: pharmacyId } }),
          this.prisma.customers.count({ where: { pharmacy_id: pharmacyId, created_at: { gte: thirtyDaysAgo } } }),
        ]);

        // Build daily/weekly/monthly from ClickHouse daily rows
        const revenueByDay = new Map(dailyRows.map((r) => [r.day, r.revenue]));
        const daily: number[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          daily.push(revenueByDay.get(d) ?? 0);
        }
        const weekly: number[] = [];
        for (let w = 3; w >= 0; w--) {
          let total = 0;
          for (let d = 0; d < 7; d++) {
            const day = new Date(now.getTime() - (w * 7 + d) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            total += revenueByDay.get(day) ?? 0;
          }
          weekly.unshift(Math.round(total));
        }
        const monthly: number[] = [];
        for (let m = 2; m >= 0; m--) {
          const start = new Date(now.getFullYear(), now.getMonth() - m, 1);
          const end = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
          let total = 0;
          for (const row of dailyRows) {
            const d = new Date(row.day);
            if (d >= start && d < end) total += row.revenue;
          }
          monthly.push(Math.round(total));
        }

        const last30Revenue = dailyRows.filter((r) => r.day >= from30).reduce((s, r) => s + r.revenue, 0);
        const prev30start = new Date(thirtyDaysAgo.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const prev30Revenue = dailyRows.filter((r) => r.day >= prev30start && r.day < from30).reduce((s, r) => s + r.revenue, 0);
        const growthFactor = prev30Revenue > 0 ? last30Revenue / prev30Revenue : 1;
        const orderCount30 = dailyRows.filter((r) => r.day >= from30).reduce((s, r) => s + r.orders, 0) || 1;

        return {
          salesTrends: { daily, weekly, monthly },
          topProducts: topMeds.map((r) => ({ name: r.medication_name, sales: r.revenue, quantity: r.quantity, growth: 0 })),
          customerInsights: {
            totalCustomers: customerCount,
            newCustomers,
            returningCustomers: Math.max(customerCount - newCustomers, 0),
            averageOrderValue: Math.round(last30Revenue / orderCount30),
          },
          predictions: {
            nextMonthSales: Math.round(last30Revenue * growthFactor),
            confidence: "estimated",
            reasoning: prev30Revenue > 0
              ? `Based on ${last30Revenue >= prev30Revenue ? "growth" : "decline"} trend of ${Math.round((growthFactor - 1) * 100)}% from the previous 30-day period`
              : "Insufficient historical data for trend-based prediction",
            stockNeeded: topMeds.slice(0, 3).map((r) => ({
              product: r.medication_name,
              predicted: Math.ceil(r.quantity * growthFactor),
            })),
          },
          insights: {
            summary: `Revenue of ${Math.round(last30Revenue).toLocaleString()} RWF over the last 30 days with ${orderCount30} orders`,
            trends: weekly.length >= 2
              ? weekly[weekly.length - 1]! >= weekly[0]!
                ? "Upward trend detected in weekly sales"
                : "Downward trend in weekly sales"
              : "Insufficient data for trend analysis",
            recommendations: [],
            aiPowered: false,
            source: "clickhouse",
          },
        };
      } catch {
        // Fall through to Postgres
      }
    }

    // ── Postgres fallback ──────────────────────────────────────────────────────
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const recentSales = await this.prisma.sales.findMany({
      where: {
        pharmacy_id: pharmacyId,
        created_at: { gte: ninetyDaysAgo },
      },
      select: { total_amount: true, created_at: true },
      orderBy: { created_at: "asc" },
    });

    const daily: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = startOfDay(new Date(now.getTime() - i * 24 * 60 * 60 * 1000));
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      daily.push(
        Math.round(
          sumSales(
            recentSales.filter(
              (sale) =>
                sale.created_at && sale.created_at >= dayStart && sale.created_at < dayEnd,
            ),
          ),
        ),
      );
    }

    const weekly: number[] = [];
    for (let w = 3; w >= 0; w--) {
      const weekEnd = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000);
      const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      weekly.push(
        Math.round(
          sumSales(
            recentSales.filter(
              (sale) =>
                sale.created_at && sale.created_at >= weekStart && sale.created_at < weekEnd,
            ),
          ),
        ),
      );
    }

    const monthly: number[] = [];
    for (let m = 2; m >= 0; m--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
      monthly.push(
        Math.round(
          sumSales(
            recentSales.filter(
              (sale) =>
                sale.created_at && sale.created_at >= monthStart && sale.created_at < monthEnd,
            ),
          ),
        ),
      );
    }

    const topProductRows = await this.prisma.sale_items.groupBy({
      by: ["inventory_id"],
      where: {
        sales: { pharmacy_id: pharmacyId, created_at: { gte: thirtyDaysAgo } },
      },
      _sum: { quantity: true, total_price: true },
      orderBy: { _sum: { total_price: "desc" } },
      take: 5,
    });

    const inventoryIds = topProductRows
      .map((row) => row.inventory_id)
      .filter((id): id is string => Boolean(id));

    const inventoryNames =
      inventoryIds.length > 0
        ? await this.prisma.inventory.findMany({
            where: { id: { in: inventoryIds } },
            select: { id: true, medications: { select: { name: true } } },
          })
        : [];

    const nameByInventory = new Map(
      inventoryNames.map((row) => [row.id, row.medications?.name ?? "Unknown"]),
    );

    const topProducts = topProductRows.map((row) => ({
      name: nameByInventory.get(row.inventory_id ?? "") ?? "Unknown",
      sales: Math.round(decimal(row._sum.total_price)),
      quantity: Number(row._sum.quantity ?? 0),
      growth: 0,
    }));

    const [customerCount, newCustomers, salesLast30] = await Promise.all([
      this.prisma.customers.count({ where: { pharmacy_id: pharmacyId } }),
      this.prisma.customers.count({
        where: { pharmacy_id: pharmacyId, created_at: { gte: thirtyDaysAgo } },
      }),
      this.prisma.sales.findMany({
        where: { pharmacy_id: pharmacyId, created_at: { gte: thirtyDaysAgo } },
        select: { total_amount: true, customer_name: true },
      }),
    ]);

    const totalRevenue30 = sumSales(salesLast30);
    const orderCount30 = salesLast30.length || 1;

    const last30Revenue = sumSales(
      recentSales.filter((sale) => sale.created_at && sale.created_at >= thirtyDaysAgo),
    );
    const prev30Revenue = sumSales(
      recentSales.filter(
        (sale) =>
          sale.created_at &&
          sale.created_at >= new Date(thirtyDaysAgo.getTime() - 30 * 24 * 60 * 60 * 1000) &&
          sale.created_at < thirtyDaysAgo,
      ),
    );
    const growthFactor = prev30Revenue > 0 ? last30Revenue / prev30Revenue : 1;

    const stockNeeded = await this.prisma.sale_items.groupBy({
      by: ["inventory_id"],
      where: {
        sales: { pharmacy_id: pharmacyId, created_at: { gte: thirtyDaysAgo } },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 3,
    });

    return {
      salesTrends: { daily, weekly, monthly },
      topProducts,
      customerInsights: {
        totalCustomers: customerCount,
        newCustomers,
        returningCustomers: Math.max(customerCount - newCustomers, 0),
        averageOrderValue: Math.round(totalRevenue30 / orderCount30),
      },
      predictions: {
        nextMonthSales: Math.round(last30Revenue * growthFactor),
        confidence: "estimated",
        reasoning:
          prev30Revenue > 0
            ? `Based on ${last30Revenue >= prev30Revenue ? "growth" : "decline"} trend of ${Math.round((growthFactor - 1) * 100)}% from the previous 30-day period`
            : "Insufficient historical data for trend-based prediction",
        stockNeeded: stockNeeded.map((row) => ({
          product: nameByInventory.get(row.inventory_id ?? "") ?? "Unknown",
          predicted: Math.ceil(Number(row._sum.quantity ?? 0) * growthFactor),
        })),
      },
      insights: {
        summary: `Revenue of ${Math.round(totalRevenue30).toLocaleString()} RWF over the last 30 days with ${orderCount30} orders`,
        trends: weekly.length >= 2
          ? weekly[weekly.length - 1] >= weekly[0]
            ? "Upward trend detected in weekly sales"
            : "Downward trend in weekly sales"
          : "Insufficient data for trend analysis",
        recommendations: [],
        aiPowered: false,
      },
    };
  }
}
