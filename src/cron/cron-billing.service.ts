import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";

const PENDING_TX_STATUSES = ["pending", "processing"] as const;
const PENDING_SUB_STATUSES = ["pending_payment", "pending"] as const;

@Injectable()
export class CronBillingService {
  private readonly logger = new Logger(CronBillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Daily at 02:00 — cancel stale pending payments & subscriptions. */
  @Cron("0 2 * * *", { name: "cancel-stale-pending-payments" })
  async cancelStalePendingPayments(): Promise<void> {
    const maxAgeDays = this.getPendingPaymentMaxAgeDays();
    this.logger.log(`Running cancel-stale-pending-payments (maxAge: ${maxAgeDays}d)`);
    try {
      const result = await this.expireStalePendingPayments(maxAgeDays);
      this.logger.log(
        `Cancelled ${result.paymentsCancelled} payments, ${result.subscriptionsCancelled} subscriptions`,
      );
    } catch (err) {
      this.logger.error("cancel-stale-pending-payments failed", err);
    }
  }

  /** Daily at 01:00 — apply scheduled subscription transitions. */
  @Cron("0 1 * * *", { name: "subscription-transitions" })
  async subscriptionTransitions(): Promise<void> {
    this.logger.log("Running subscription-transitions");
    try {
      const result = await this.applyScheduledSubscriptionChanges();
      this.logger.log(
        `Processed ${result.processed}, applied ${result.applied}, expired ${result.expired}`,
      );
    } catch (err) {
      this.logger.error("subscription-transitions failed", err);
    }
  }

  /** Daily at 09:00 — send renewal reminder notifications at 14d, 7d, 3d, 1d before expiry. */
  @Cron("0 9 * * *", { name: "subscription-renewal-reminders" })
  async subscriptionRenewalReminders(): Promise<void> {
    this.logger.log("Running subscription-renewal-reminders");
    try {
      const result = await this.runRenewalReminders();
      this.logger.log(`Renewal reminders: ${result.sent} sent, ${result.skipped} already sent`);
    } catch (err) {
      this.logger.error("subscription-renewal-reminders failed", err);
    }
  }

  // ─── Manual trigger endpoint helpers ───────────────────────────────────────

  async runCancelStalePendingPayments() {
    const maxAgeDays = this.getPendingPaymentMaxAgeDays();
    return this.expireStalePendingPayments(maxAgeDays);
  }

  async runSubscriptionTransitions() {
    return this.applyScheduledSubscriptionChanges();
  }

  async runRenewalReminders() {
    // Remind at these thresholds (days before expiry)
    const REMINDER_DAYS = [14, 7, 3, 1];
    const now = new Date();
    let sent = 0;
    let skipped = 0;

    for (const daysLeft of REMINDER_DAYS) {
      const windowStart = new Date(now.getTime() + daysLeft * 86_400_000);
      windowStart.setHours(0, 0, 0, 0);
      const windowEnd = new Date(windowStart.getTime() + 86_400_000);

      const expiringSubs = await this.prisma.subscriptions.findMany({
        where: {
          is_active: true,
          status: { notIn: ["cancelled", "expired", "pending_payment"] },
          expires_at: { gte: windowStart, lt: windowEnd },
        },
        select: {
          id: true,
          pharmacy_id: true,
          expires_at: true,
          plan_id: true,
          pharmacies: { select: { name: true, pharmacy_users: {
            where: { role: { in: ["pharmacy_owner", "admin"] }, is_active: true },
            select: { user_id: true },
            take: 1,
          }}},
          subscription_plans_subscriptions_plan_idTosubscription_plans: { select: { name: true } },
        },
      });

      for (const sub of expiringSubs) {
        if (!sub.pharmacy_id) continue;

        const dedupeKey = `renewal_reminder:${sub.id}:${daysLeft}d`;

        // Skip if already sent this reminder for this subscription
        const alreadySent = await this.prisma.subscription_notification_log.findUnique({
          where: { key: dedupeKey },
        });
        if (alreadySent) { skipped++; continue; }

        const planName = sub.subscription_plans_subscriptions_plan_idTosubscription_plans?.name ?? "your plan";
        const pharmacyName = sub.pharmacies?.name ?? "your pharmacy";
        const ownerId = sub.pharmacies?.pharmacy_users[0]?.user_id ?? null;
        const expiryDate = sub.expires_at?.toISOString().slice(0, 10) ?? "";
        const urgency = daysLeft <= 3 ? "urgent" : "warning";

        // Write in-app notification to outbox
        await this.prisma.notification_outbox.create({
          data: {
            event_type: "subscription.expiring_soon",
            pharmacy_id: sub.pharmacy_id,
            user_id: ownerId,
            payload: {
              title: daysLeft === 1
                ? `⚠️ Subscription expires tomorrow!`
                : `Subscription expires in ${daysLeft} days`,
              message: `${planName} for ${pharmacyName} expires on ${expiryDate}. Renew now to keep full access.`,
              type: urgency,
              actionUrl: "/pharmacy/billing",
              daysLeft,
              planName,
              expiryDate,
            } as any,
          },
        });

        // Record that we sent this reminder (deduplication)
        await this.prisma.subscription_notification_log.create({
          data: {
            key: dedupeKey,
            pharmacy_id: sub.pharmacy_id,
            subscription_id: sub.id,
          },
        });

        sent++;
      }
    }

    return { sent, skipped, ranAt: new Date().toISOString() };
  }

  // ─── Core logic ─────────────────────────────────────────────────────────────

  private getPendingPaymentMaxAgeDays(): number {
    const raw = Number(process.env.PENDING_PAYMENT_EXPIRE_DAYS ?? 7);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 7;
  }

  async expireStalePendingPayments(maxAgeDays = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);

    const pharmacyIds = new Set<string>();
    let paymentsCancelled = 0;
    let subscriptionsCancelled = 0;

    const staleTx = await this.prisma.payment_transactions.findMany({
      where: { status: { in: [...PENDING_TX_STATUSES] }, created_at: { lt: cutoff } },
      select: { id: true, pharmacy_id: true },
    });

    for (const tx of staleTx) {
      await this.prisma.payment_transactions.update({
        where: { id: tx.id },
        data: { status: "cancelled", error_message: "Expired by system", updated_at: new Date() },
      });
      paymentsCancelled++;
      if (tx.pharmacy_id) pharmacyIds.add(tx.pharmacy_id);
    }

    const staleSubs = await this.prisma.subscriptions.findMany({
      where: { status: { in: [...PENDING_SUB_STATUSES] }, created_at: { lt: cutoff } },
      select: { id: true, pharmacy_id: true },
    });

    const now = new Date();
    for (const sub of staleSubs) {
      if (!sub.pharmacy_id) continue;
      await this.prisma.subscriptions.update({
        where: { id: sub.id },
        data: { status: "cancelled", is_active: false, cancelled_at: now },
      });
      await this.prisma.payment_transactions.updateMany({
        where: { subscription_id: sub.id, status: { in: [...PENDING_TX_STATUSES] } },
        data: { status: "cancelled", updated_at: now },
      });
      subscriptionsCancelled++;
      pharmacyIds.add(sub.pharmacy_id);
    }

    return {
      paymentsCancelled,
      subscriptionsCancelled,
      pharmacyIds: Array.from(pharmacyIds),
      maxAgeDays,
      ranAt: new Date().toISOString(),
    };
  }

  private async applyScheduledSubscriptionChanges() {
    const now = new Date();

    // Apply subscriptions that have a pending downgrade/change scheduled in the past
    const dueSubscriptions = await this.prisma.subscriptions.findMany({
      where: {
        is_active: true,
        change_scheduled_at: { lte: now },
        status: { notIn: ["cancelled", "expired"] },
      },
      select: { id: true, next_plan_id: true, change_scheduled_at: true },
    });

    let applied = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const sub of dueSubscriptions) {
      try {
        if (sub.next_plan_id) {
          await this.prisma.subscriptions.update({
            where: { id: sub.id },
            data: {
              plan_id: sub.next_plan_id,
              next_plan_id: null,
              change_scheduled_at: null,
              change_type: null,
              pending_change_status: null,
            },
          });
          applied++;
        } else {
          skipped++;
        }
      } catch (err) {
        errors.push(String(err));
        skipped++;
      }
    }

    // Expire subscriptions past their expiry date
    const expiredSubs = await this.prisma.subscriptions.findMany({
      where: {
        is_active: true,
        expires_at: { lt: now },
        status: { notIn: ["cancelled", "expired"] },
      },
      select: { id: true },
    });
    for (const sub of expiredSubs) {
      await this.prisma.subscriptions.update({
        where: { id: sub.id },
        data: { is_active: false, status: "expired" },
      });
    }

    return {
      processed: dueSubscriptions.length,
      applied,
      skipped,
      errors,
      expired: expiredSubs.length,
      ranAt: new Date().toISOString(),
    };
  }
}
