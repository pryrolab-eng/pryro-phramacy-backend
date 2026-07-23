import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 5;

@Injectable()
export class CronNotificationsService {
  private readonly logger = new Logger(CronNotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Every 2 minutes — dispatch pending notification outbox rows. */
  @Cron("*/2 * * * *", { name: "notification-dispatch" })
  async notificationDispatch(): Promise<void> {
    try {
      const result = await this.runNotificationDispatch();
      if (result.processed > 0 || result.failed > 0) {
        this.logger.log(`Notifications: processed=${result.processed}, failed=${result.failed}`);
      }
    } catch (err) {
      this.logger.error("notification-dispatch failed", err);
    }
  }

  async runNotificationDispatch() {
    const rows = await this.prisma.notification_outbox.findMany({
      where: {
        status: "pending",
        attempts: { lt: MAX_ATTEMPTS },
      },
      orderBy: { created_at: "asc" },
      take: BATCH_SIZE,
    });

    if (!rows.length) return { processed: 0, failed: 0 };

    let processed = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        await this.processOutboxRow(row);
        processed++;
      } catch (err) {
        failed++;
        const nextAttempts = row.attempts + 1;
        const message = err instanceof Error ? err.message : "dispatch_failed";
        this.logger.warn(`Notification ${row.id} failed: ${message}`);
        await this.prisma.notification_outbox.update({
          where: { id: row.id },
          data: {
            status: nextAttempts >= MAX_ATTEMPTS ? "failed" : "pending",
            last_error: message,
            attempts: nextAttempts,
          },
        });
      }
    }

    return { processed, failed, ranAt: new Date().toISOString() };
  }

  private async processOutboxRow(row: {
    id: string;
    event_type: string;
    pharmacy_id: string | null;
    user_id: string | null;
    payload: unknown;
    attempts: number;
  }): Promise<void> {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const title = this.titleForEvent(row.event_type, payload);
    const message = this.messageForEvent(row.event_type, payload);
    const type = typeof payload["type"] === "string" ? payload["type"] : "info";
    const actionUrl = typeof payload["actionUrl"] === "string" ? payload["actionUrl"] : null;

    await this.prisma.notifications.create({
      data: {
        pharmacy_id: row.pharmacy_id,
        user_id: row.pharmacy_id ? row.user_id : null,
        title,
        message,
        type,
        action_url: actionUrl,
      },
    });

    await this.prisma.notification_outbox.update({
      where: { id: row.id },
      data: { status: "processed", processed_at: new Date() },
    });
  }

  private titleForEvent(eventType: string, payload: Record<string, unknown>): string {
    if (typeof payload["title"] === "string" && payload["title"].trim()) {
      return payload["title"].trim();
    }
    const titles: Record<string, string> = {
      "sale.completed": "Sale completed",
      "platform.maintenance": "Maintenance notice",
      "platform.pharmacy_registered": "New pharmacy registered",
      "platform.subscription_paid": "Subscription payment received",
      "platform.subscription_cancelled": "Subscription cancelled",
      "inventory.low_stock": "Low stock alert",
      "inventory.expiring_soon": "Expiry alert",
      "subscription.expiring_soon": "Subscription expiring soon",
      "subscription.price_changed": "Plan price changed",
    };
    return titles[eventType] ?? "Notification";
  }

  private messageForEvent(eventType: string, payload: Record<string, unknown>): string {
    if (typeof payload["message"] === "string" && payload["message"].trim()) {
      return payload["message"].trim();
    }
    if (eventType === "sale.completed") {
      const receipt = payload["receiptNumber"];
      const total = payload["total"];
      const parts = ["A POS sale was recorded."];
      if (receipt) parts.push(`Receipt: ${receipt}.`);
      if (total != null) parts.push(`Total: ${total}.`);
      return parts.join(" ");
    }
    if (eventType === "platform.pharmacy_registered") {
      const name = payload["pharmacyName"];
      return name ? `${name} joined the platform.` : "A new pharmacy joined the platform.";
    }
    return "You have a new notification.";
  }
}
