import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { createHmac } from "crypto";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CronIntegrationsService {
  private readonly logger = new Logger(CronIntegrationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Every 5 minutes — deliver pending integration webhook payloads. */
  @Cron("*/5 * * * *", { name: "webhook-dispatch" })
  async webhookDispatch(): Promise<void> {
    try {
      const result = await this.runWebhookDispatch();
      if (result.processed > 0) {
        this.logger.log(
          `Webhooks: processed=${result.processed}, delivered=${result.delivered}, failed=${result.failed}`,
        );
      }
    } catch (err) {
      this.logger.error("webhook-dispatch failed", err);
    }
  }

  /** Every 6 hours — scan all active pharmacies for low stock / expiring items and fire webhook events. */
  @Cron("0 */6 * * *", { name: "integration-events" })
  async integrationEvents(): Promise<void> {
    this.logger.log("Running integration-events");
    try {
      const result = await this.runIntegrationEvents();
      this.logger.log(
        `Scanned ${result.pharmaciesScanned} pharmacies, low_stock=${result.lowStockEvents}, expiring=${result.expiringEvents}`,
      );
    } catch (err) {
      this.logger.error("integration-events failed", err);
    }
  }

  // ─── Runnable from controller ──────────────────────────────────────────────

  async runWebhookDispatch(limit = 50) {
    const rows = await this.prisma.integration_webhook_deliveries.findMany({
      where: { status: "pending", attempts: { lt: 5 } },
      orderBy: { created_at: "asc" },
      take: limit,
      include: { integration_webhooks: true },
    });

    let delivered = 0;
    let failed = 0;

    for (const row of rows) {
      const webhook = row.integration_webhooks;
      if (!webhook?.is_active) {
        await this.prisma.integration_webhook_deliveries.update({
          where: { id: row.id },
          data: { status: "failed", attempts: row.attempts + 1, last_error: "Webhook inactive" },
        });
        failed++;
        continue;
      }

      const body = JSON.stringify({
        id: row.id,
        type: row.event_type,
        createdAt: row.created_at.toISOString(),
        data: row.payload,
      });

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Pryrox-Event": row.event_type,
      };
      if (webhook.secret) {
        headers["X-Pryrox-Signature"] = createHmac("sha256", webhook.secret)
          .update(body)
          .digest("hex");
      }

      try {
        const response = await fetch(webhook.url, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(15_000),
        });
        const attempts = row.attempts + 1;
        if (response.ok) {
          await this.prisma.integration_webhook_deliveries.update({
            where: { id: row.id },
            data: { status: "delivered", attempts, response_status: response.status },
          });
          delivered++;
        } else {
          await this.prisma.integration_webhook_deliveries.update({
            where: { id: row.id },
            data: {
              status: attempts >= 5 ? "failed" : "pending",
              attempts,
              response_status: response.status,
              last_error: `HTTP ${response.status}`,
            },
          });
          failed++;
        }
      } catch (err) {
        const attempts = row.attempts + 1;
        await this.prisma.integration_webhook_deliveries.update({
          where: { id: row.id },
          data: {
            status: attempts >= 5 ? "failed" : "pending",
            attempts,
            last_error: err instanceof Error ? err.message : "Delivery failed",
          },
        });
        failed++;
      }
    }

    return { processed: rows.length, delivered, failed, ranAt: new Date().toISOString() };
  }

  async runIntegrationEvents() {
    const pharmacies = await this.prisma.pharmacies.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
      take: 200,
    });

    let lowStockEvents = 0;
    let expiringEvents = 0;

    for (const pharmacy of pharmacies) {
      const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const [lowStock, expiring] = await Promise.all([
        this.prisma.inventory.findMany({
          where: {
            pharmacy_id: pharmacy.id,
            quantity_in_stock: { lte: 10 },
          },
          select: { id: true, quantity_in_stock: true, medications: { select: { name: true } } },
          take: 20,
        }),
        this.prisma.inventory.findMany({
          where: {
            pharmacy_id: pharmacy.id,
            expiry_date: { lte: thirtyDaysOut, gte: new Date() },
          },
          select: { id: true, expiry_date: true, medications: { select: { name: true } } },
          take: 20,
        }),
      ]);

      if (lowStock.length > 0) {
        await this.enqueueWebhookEvent(pharmacy.id, "inventory.low_stock", {
          pharmacyId: pharmacy.id,
          pharmacyName: pharmacy.name,
          items: lowStock.map((i) => ({ id: i.id, name: i.medications?.name, quantity: i.quantity_in_stock })),
          count: lowStock.length,
        });
        lowStockEvents++;
      }

      if (expiring.length > 0) {
        await this.enqueueWebhookEvent(pharmacy.id, "inventory.expiring_soon", {
          pharmacyId: pharmacy.id,
          pharmacyName: pharmacy.name,
          items: expiring.map((i) => ({ id: i.id, name: i.medications?.name, expiryDate: i.expiry_date })),
          count: expiring.length,
          withinDays: 30,
        });
        expiringEvents++;
      }
    }

    return {
      pharmaciesScanned: pharmacies.length,
      lowStockEvents,
      expiringEvents,
      ranAt: new Date().toISOString(),
    };
  }

  private async enqueueWebhookEvent(
    pharmacyId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    // Webhooks link via api_keys → pharmacy; find all active webhooks for this pharmacy
    const apiKeys = await this.prisma.api_keys.findMany({
      where: { pharmacy_id: pharmacyId, is_active: true },
      select: { id: true },
    });
    if (!apiKeys.length) return;

    const webhooks = await this.prisma.integration_webhooks.findMany({
      where: {
        api_key_id: { in: apiKeys.map((k) => k.id) },
        is_active: true,
      },
      select: { id: true },
    });

    for (const webhook of webhooks) {
      await this.prisma.integration_webhook_deliveries.create({
        data: {
          webhook_id: webhook.id,
          event_type: eventType,
          payload: payload as any,
          status: "pending",
          attempts: 0,
        },
      });
    }
  }
}
