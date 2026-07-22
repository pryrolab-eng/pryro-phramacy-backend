import { Injectable, Logger, Optional } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import type { Queue } from "bull";
import { PrismaService } from "../prisma/prisma.service";

export type MaintenanceNotifyJobData = {
  email: string;
  message: string;
  scheduledAt: string;
  batchId: string;
};

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @InjectQueue("maintenance-notify") private readonly queue: Queue | null,
  ) {}

  isRedisConfigured(): boolean {
    return Boolean(process.env["REDIS_URL"] || process.env["REDIS_HOST"]);
  }

  async dispatchMaintenanceNotifications(input: {
    message: string;
    scheduledAt: string;
  }): Promise<{ queued: number; skipped: boolean; reason?: string }> {
    if (!this.isRedisConfigured() || !this.queue) {
      this.logger.warn("Redis not configured — maintenance notifications not queued");
      return { queued: 0, skipped: true, reason: "Redis not configured" };
    }

    const batchId = `maintenance_${Date.now()}`;

    // Get all active users with emails
    const users = await this.prisma.auth_users.findMany({
      where: { email: { not: null }, email_confirmed_at: { not: null } },
      select: { id: true, email: true },
      take: 10000,
    });

    let queued = 0;
    for (const user of users) {
      if (!user.email) continue;

      // Skip already-notified users for this batch
      const alreadyNotified = await this.prisma.maintenance_notification_log.findFirst({
        where: { batch_id: batchId, email: user.email },
      });
      if (alreadyNotified) continue;

      await this.queue.add(
        { email: user.email, message: input.message, scheduledAt: input.scheduledAt, batchId } satisfies MaintenanceNotifyJobData,
        { attempts: 3, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: 1000, removeOnFail: 5000 },
      );
      queued++;
    }

    this.logger.log(`Queued ${queued} maintenance notification emails (batch ${batchId})`);
    return { queued, skipped: false };
  }

  async getQueueStats() {
    if (!this.queue) {
      return { available: false, reason: "Redis not configured" };
    }
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);
    return { available: true, waiting, active, completed, failed };
  }
}
