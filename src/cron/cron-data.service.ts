import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CronDataService {
  private readonly logger = new Logger(CronDataService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Daily at 03:00 — purge expired audit logs, webhook deliveries, rate limit buckets. */
  @Cron("0 3 * * *", { name: "data-retention" })
  async dataRetention(): Promise<void> {
    this.logger.log("Running data-retention");
    try {
      const result = await this.runDataRetention();
      this.logger.log(
        `Purged: ${result.auditLogsDeleted} audit logs, ` +
          `${result.webhookDeliveriesDeleted} webhook deliveries, ` +
          `${result.rateLimitBucketsDeleted} rate limit buckets`,
      );
    } catch (err) {
      this.logger.error("data-retention failed", err);
    }
  }

  async runDataRetention() {
    const retentionDays = await this.getDataRetentionDays();
    if (retentionDays <= 0) {
      return { retentionDays: 0, auditLogsDeleted: 0, webhookDeliveriesDeleted: 0, rateLimitBucketsDeleted: 0 };
    }

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const [auditLogs, webhookDeliveries, rateLimitBuckets] = await Promise.all([
      this.prisma.audit_logs.deleteMany({ where: { created_at: { lt: cutoff } } }),
      this.prisma.integration_webhook_deliveries.deleteMany({
        where: { created_at: { lt: cutoff }, status: { in: ["delivered", "failed"] } },
      }),
      this.prisma.rate_limit_buckets.deleteMany({ where: { updated_at: { lt: cutoff } } }),
    ]);

    return {
      retentionDays,
      auditLogsDeleted: auditLogs.count,
      webhookDeliveriesDeleted: webhookDeliveries.count,
      rateLimitBucketsDeleted: rateLimitBuckets.count,
      ranAt: new Date().toISOString(),
    };
  }

  private async getDataRetentionDays(): Promise<number> {
    try {
      const row = await this.prisma.system_settings.findFirst({
        where: { pharmacy_id: null, setting_key: "dataRetentionDays" },
        select: { setting_value: true },
      });
      const raw = Number(row?.setting_value ?? 90);
      return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 90;
    } catch {
      return 90;
    }
  }
}
