import { Processor, Process, OnQueueCompleted, OnQueueFailed } from "@nestjs/bull";
import type { Job } from "bull";
import { Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { maintenanceEmailHtml, maintenanceEmailText } from "../mail/mail-templates";
import type { MaintenanceNotifyJobData } from "./maintenance.service";

@Processor("maintenance-notify")
export class MaintenanceProcessor {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  @Process()
  async process(job: Job<MaintenanceNotifyJobData>) {
    const { email, message, scheduledAt } = job.data;

    if (!this.mail.isConfigured()) {
      this.logger.warn(`SMTP not configured — skipping maintenance email to ${email}`);
      return { email, sent: false, error: "SMTP not configured" };
    }

    await this.mail.sendMail({
      to: email,
      subject: "Pryrox scheduled maintenance notice",
      html: maintenanceEmailHtml({ message, scheduledAt }),
      text: maintenanceEmailText({ message, scheduledAt }),
    });

    return { email, sent: true };
  }

  @OnQueueCompleted()
  async onCompleted(job: Job<MaintenanceNotifyJobData>) {
    const result = job.returnvalue as { email: string; sent: boolean } | undefined;
    if (result?.sent) {
      await this.prisma.maintenance_notification_log.create({
        data: { batch_id: job.data.batchId, email: job.data.email, status: "sent" },
      }).catch(() => { /* non-fatal */ });
    }
  }

  @OnQueueFailed()
  async onFailed(job: Job<MaintenanceNotifyJobData>, error: Error) {
    this.logger.error(`Maintenance email to ${job.data.email} failed: ${error.message}`);
    await this.prisma.maintenance_notification_log.create({
      data: { batch_id: job.data.batchId, email: job.data.email, status: "failed", error: error.message },
    }).catch(() => { /* non-fatal */ });
  }
}
