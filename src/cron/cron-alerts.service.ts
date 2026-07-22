import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CronAlertsService {
  private readonly logger = new Logger(CronAlertsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Daily at 08:00 — scan every active pharmacy for low stock and expiring items,
   *  write in-app notifications to the outbox for the pharmacy owner. */
  @Cron("0 8 * * *", { name: "inventory-alerts" })
  async inventoryAlerts(): Promise<void> {
    this.logger.log("Running inventory-alerts scan");
    try {
      const result = await this.runInventoryAlerts();
      this.logger.log(
        `Alert scan: ${result.pharmaciesScanned} pharmacies, ` +
        `${result.lowStockNotifications} low-stock, ${result.expiryNotifications} expiry notifications queued`,
      );
    } catch (err) {
      this.logger.error("inventory-alerts failed", err);
    }
  }

  async runInventoryAlerts() {
    const pharmacies = await this.prisma.pharmacies.findMany({
      where: { status: "active" },
      select: {
        id: true,
        name: true,
        pharmacy_users: {
          where: { role: { in: ["pharmacy_owner", "admin"] }, is_active: true },
          select: { user_id: true },
          take: 1,
        },
      },
      take: 500,
    });

    let lowStockNotifications = 0;
    let expiryNotifications = 0;
    const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const today = new Date();

    for (const pharmacy of pharmacies) {
      const ownerId = pharmacy.pharmacy_users[0]?.user_id ?? null;

      // ── Low stock ──────────────────────────────────────────────────────────
      type LowStockRow = { id: string; medication_name: string; quantity: number; minimum: number };
      const lowStockItems = await this.prisma.$queryRaw<LowStockRow[]>`
        SELECT i.id, m.name as medication_name,
               i.quantity_in_stock::int as quantity,
               i.minimum_stock_level::int as minimum
        FROM inventory i
        JOIN medications m ON m.id = i.medication_id
        WHERE i.pharmacy_id = ${pharmacy.id}
          AND i.quantity_in_stock <= i.minimum_stock_level
          AND i.minimum_stock_level > 0
        LIMIT 10
      `;

      if (lowStockItems.length > 0) {
        const names = lowStockItems.map((i) => i.medication_name).slice(0, 3).join(", ");
        const more = lowStockItems.length > 3 ? ` and ${lowStockItems.length - 3} more` : "";
        await this.prisma.notification_outbox.create({
          data: {
            event_type: "inventory.low_stock",
            pharmacy_id: pharmacy.id,
            user_id: ownerId,
            payload: {
              title: `Low stock alert — ${lowStockItems.length} item${lowStockItems.length > 1 ? "s" : ""}`,
              message: `Low stock: ${names}${more}. Please reorder soon.`,
              type: "warning",
              actionUrl: "/pharmacy/inventory?filter=low-stock",
              count: lowStockItems.length,
            } as any,
          },
        });
        lowStockNotifications++;
      }

      // ── Expiring soon ──────────────────────────────────────────────────────
      const expiringItems = await this.prisma.inventory.findMany({
        where: {
          pharmacy_id: pharmacy.id,
          expiry_date: { lte: thirtyDaysOut, gte: today },
        },
        select: { id: true, expiry_date: true, medications: { select: { name: true } } },
        orderBy: { expiry_date: "asc" },
        take: 10,
      });

      if (expiringItems.length > 0) {
        const soonest = expiringItems[0]!;
        const daysLeft = Math.ceil(
          ((soonest.expiry_date?.getTime() ?? 0) - today.getTime()) / 86_400_000,
        );
        const names = expiringItems.map((i) => i.medications?.name ?? "Unknown").slice(0, 3).join(", ");
        const more = expiringItems.length > 3 ? ` and ${expiringItems.length - 3} more` : "";
        await this.prisma.notification_outbox.create({
          data: {
            event_type: "inventory.expiring_soon",
            pharmacy_id: pharmacy.id,
            user_id: ownerId,
            payload: {
              title: `Expiry alert — ${expiringItems.length} item${expiringItems.length > 1 ? "s" : ""} expiring soon`,
              message: `${names}${more} expire${expiringItems.length === 1 ? "s" : ""} within ${daysLeft} days.`,
              type: "warning",
              actionUrl: "/pharmacy/inventory?filter=expiring",
              count: expiringItems.length,
            } as any,
          },
        });
        expiryNotifications++;
      }
    }

    return {
      pharmaciesScanned: pharmacies.length,
      lowStockNotifications,
      expiryNotifications,
      ranAt: new Date().toISOString(),
    };
  }
}
