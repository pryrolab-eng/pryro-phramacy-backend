import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  emailButton,
  emailFallbackLink,
  emailParagraph,
  escapeHtml,
  pryroxEmailLayout,
} from "../mail/mail-layout";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";

const PENDING_TX_STATUSES = ["pending", "processing"] as const;
const PENDING_SUB_STATUSES = ["pending_payment", "pending"] as const;
const DEFAULT_RENEWAL_REMINDER_DAYS = [14, 7, 3, 1] as const;
const MAX_RENEWAL_REMINDER_DAYS = 30;

@Injectable()
export class CronBillingService {
  private readonly logger = new Logger(CronBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

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
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const lookAheadEnd = new Date(
      startOfToday.getTime() + (MAX_RENEWAL_REMINDER_DAYS + 1) * 86_400_000,
    );
    let sent = 0;
    let emailed = 0;
    let skipped = 0;

      const expiringSubs = await this.prisma.subscriptions.findMany({
        where: {
          is_active: true,
          status: { notIn: ["cancelled", "expired", "pending_payment"] },
          expires_at: { gte: startOfToday, lt: lookAheadEnd },
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
        if (!sub.pharmacy_id || !sub.expires_at) continue;

        const daysLeft = Math.ceil(
          (sub.expires_at.getTime() - startOfToday.getTime()) / 86_400_000,
        );
        if (daysLeft < 1 || daysLeft > MAX_RENEWAL_REMINDER_DAYS) {
          skipped++;
          continue;
        }

        const dedupeKey = `renewal_reminder:${sub.id}:${daysLeft}d`;

        // Skip if already sent this reminder for this subscription
        const alreadySent = await this.prisma.subscription_notification_log.findUnique({
          where: { key: dedupeKey },
        });
        if (alreadySent) { skipped++; continue; }

        const planName = sub.subscription_plans_subscriptions_plan_idTosubscription_plans?.name ?? "your plan";
        const pharmacyName = sub.pharmacies?.name ?? "your pharmacy";
        const ownerId = sub.pharmacies?.pharmacy_users[0]?.user_id ?? null;
        const prefs = ownerId
          ? await this.loadRenewalNotificationPrefs(ownerId, sub.pharmacy_id)
          : {
              channelInApp: true,
              channelEmail: false,
              reminderDays: [...DEFAULT_RENEWAL_REMINDER_DAYS],
            };
        if (!prefs.reminderDays.includes(daysLeft)) {
          skipped++;
          continue;
        }
        if (!prefs.channelInApp && !prefs.channelEmail) {
          skipped++;
          continue;
        }

        const expiryDate = sub.expires_at.toISOString().slice(0, 10);
        const urgency = daysLeft <= 3 ? "urgent" : "warning";
        const billingUrl = `${this.getAppUrl()}/pharmacy/billing`;
        const reminderTitle =
          daysLeft === 1
            ? "Subscription expires tomorrow"
            : `Subscription expires in ${daysLeft} days`;

        if (prefs.channelInApp) {
          await this.prisma.notification_outbox.create({
            data: {
              event_type: "subscription.expiring_soon",
              pharmacy_id: sub.pharmacy_id,
              user_id: ownerId,
              payload: withoutLegacyTitle({
                legacyTitle: daysLeft === 1
                ? `⚠️ Subscription expires tomorrow!`
                : `Subscription expires in ${daysLeft} days`,
                title: reminderTitle,
                message: `${planName} for ${pharmacyName} expires on ${expiryDate}. Renew now to keep full access.`,
                type: urgency,
                actionUrl: "/pharmacy/billing",
                daysLeft,
                planName,
                expiryDate,
              }),
            },
          });
        }

        if (prefs.channelEmail && ownerId) {
          const owner = await this.prisma.auth_users.findUnique({
            where: { id: ownerId },
            select: { email: true },
          });
          if (owner?.email) {
            const emailInput = {
              pharmacyName,
              planName,
              expiryDate,
              daysLeft,
              billingUrl,
            };
            await this.mail.sendMail({
              to: owner.email,
              subject:
                daysLeft === 1
                  ? `${pharmacyName} subscription expires tomorrow`
                  : `${pharmacyName} subscription expires in ${daysLeft} days`,
              html: renewalReminderEmailHtml(emailInput),
              text: renewalReminderEmailText(emailInput),
            });
            emailed++;
          }
        }

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
    return { sent, emailed, skipped, ranAt: new Date().toISOString() };
  }

  // ─── Core logic ─────────────────────────────────────────────────────────────

  private async loadRenewalNotificationPrefs(userId: string, pharmacyId: string) {
    const row = await this.prisma.notification_preferences.findFirst({
      where: { user_id: userId, pharmacy_id: pharmacyId },
      select: {
        channel_in_app: true,
        channel_email: true,
        event_prefs: true,
      },
    });
    const eventPrefs =
      row?.event_prefs &&
      typeof row.event_prefs === "object" &&
      !Array.isArray(row.event_prefs)
        ? (row.event_prefs as Record<string, unknown>)
        : {};

    return {
      channelInApp: row?.channel_in_app ?? true,
      channelEmail: row?.channel_email ?? true,
      reminderDays: normalizeRenewalDays(eventPrefs.subscriptionRenewalDays),
    };
  }

  private getAppUrl(): string {
    return (
      process.env["NEXT_PUBLIC_APP_URL"] ??
      process.env["APP_URL"] ??
      "https://pryromed.vercel.app"
    ).replace(/\/+$/, "");
  }

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

type RenewalReminderEmailInput = {
  pharmacyName: string;
  planName: string;
  expiryDate: string;
  daysLeft: number;
  billingUrl: string;
};

function normalizeRenewalDays(value: unknown): number[] {
  if (!Array.isArray(value)) return [...DEFAULT_RENEWAL_REMINDER_DAYS];
  const days = value
    .filter((day): day is number => typeof day === "number" && Number.isInteger(day))
    .filter((day) => day >= 1 && day <= MAX_RENEWAL_REMINDER_DAYS);
  return [...new Set(days)].sort((a, b) => b - a);
}

function renewalReminderEmailHtml(input: RenewalReminderEmailInput): string {
  const timing =
    input.daysLeft === 1
      ? "tomorrow"
      : `in ${input.daysLeft} days`;

  return pryroxEmailLayout({
    title: `Renew ${input.pharmacyName}`,
    preheader: `${input.planName} expires ${timing}. Renew now to keep access uninterrupted.`,
    bodyHtml: [
      emailParagraph(
        `${escapeHtml(input.planName)} for <strong>${escapeHtml(input.pharmacyName)}</strong> expires <strong>${escapeHtml(timing)}</strong> on ${escapeHtml(input.expiryDate)}.`,
      ),
      emailParagraph(
        "Renew before the expiry date to keep POS, inventory, reports, staff, and branch access available without interruption.",
      ),
      emailButton("Renew subscription", input.billingUrl),
      emailFallbackLink(input.billingUrl),
    ].join(""),
    footerNote: "You are receiving this because subscription renewal reminders are enabled for your pharmacy.",
  });
}

function renewalReminderEmailText(input: RenewalReminderEmailInput): string {
  const timing =
    input.daysLeft === 1
      ? "tomorrow"
      : `in ${input.daysLeft} days`;
  return [
    `${input.planName} for ${input.pharmacyName} expires ${timing} on ${input.expiryDate}.`,
    "Renew before the expiry date to keep access uninterrupted.",
    `Renew subscription: ${input.billingUrl}`,
  ].join("\n\n");
}

function withoutLegacyTitle<T extends { legacyTitle?: unknown }>(
  payload: T,
): Omit<T, "legacyTitle"> {
  const { legacyTitle: _legacyTitle, ...clean } = payload;
  return clean;
}
