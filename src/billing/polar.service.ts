import { Injectable, HttpException, Logger } from "@nestjs/common";
import { Polar } from "@polar-sh/sdk";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeGateway } from "../integrations/realtime.gateway";
import { MailService } from "../mail/mail.service";

function isPolarConfigured(): boolean {
  return Boolean(process.env.POLAR_ACCESS_TOKEN?.trim());
}

function getPolarServer(): "production" | "sandbox" {
  return process.env.POLAR_SERVER === "production" ? "production" : "sandbox";
}

function getPolarClient(): Polar {
  const token = process.env.POLAR_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("Polar is not configured (POLAR_ACCESS_TOKEN missing).");
  return new Polar({ accessToken: token, server: getPolarServer() });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class PolarService {
  private readonly logger = new Logger(PolarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly mail: MailService,
  ) {}

  getConfig() {
    return { enabled: isPolarConfigured(), server: getPolarServer() };
  }

  async listProducts(): Promise<{ products: Array<{ id: string; name: string; isArchived: boolean; description?: string }> }> {
    if (!isPolarConfigured()) {
      return { products: [] };
    }
    const polar = getPolarClient();
    const res = await polar.products.list({ limit: 100 });
    const items = res.result?.items ?? [];
    return {
      products: items.map((p) => ({
        id: p.id,
        name: p.name ?? "(unnamed)",
        isArchived: (p as { isArchived?: boolean }).isArchived === true,
        description: (p as { description?: string }).description ?? undefined,
      })),
    };
  }

  async createCheckout(input: {
    pharmacyId: string; userId: string; planId: string; subscriptionId: string;
    returnContext?: string; customerEmail: string; customerName: string; customerPhone?: string;
  }) {
    if (!isPolarConfigured()) {
      throw new HttpException("Card checkout is not configured. Use Mobile Money or contact support.", 503);
    }

    const plan = UUID_RE.test(input.planId)
      ? await this.prisma.subscription_plans.findFirst({ where: { is_active: true, id: input.planId }, select: { id: true, name: true, price: true, yearly_price: true, billing_period: true, polar_product_id: true } })
      : await this.prisma.subscription_plans.findFirst({ where: { is_active: true, name: { equals: input.planId, mode: "insensitive" } }, select: { id: true, name: true, price: true, yearly_price: true, billing_period: true, polar_product_id: true } });

    if (!plan) throw new HttpException("Plan not found", 404);
    const billingPeriod = plan.billing_period ?? "monthly";
    const chargeAmount = billingPeriod === "yearly" && plan.yearly_price ? Number(plan.yearly_price) : Number(plan.price);
    if (chargeAmount <= 0) throw new HttpException("Free plans do not require Polar checkout.", 400);
    if (!plan.polar_product_id) {
      throw new HttpException(
        `Plan "${plan.name}" is not configured for card payments yet. Please contact support or use Mobile Money.`,
        400,
      );
    }

    const polar = getPolarClient();
    try {
      const subs = await polar.subscriptions.list({ productId: plan.polar_product_id, active: true, limit: 20 });
      for (const item of subs.result?.items ?? []) {
        if (item.metadata?.pharmacy_id === input.pharmacyId) {
          try { await polar.subscriptions.revoke({ id: item.id }); } catch {}
        }
      }
    } catch {}

    const successUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/payment/success?provider=polar&return=${encodeURIComponent(input.returnContext ?? "settings")}&checkout_id={CHECKOUT_ID}`;

    const checkout = await polar.checkouts.create({
      products: [plan.polar_product_id], successUrl,
      customerEmail: input.customerEmail, customerName: input.customerName,
      metadata: {
        pharmacy_id: input.pharmacyId, subscription_id: input.subscriptionId,
        plan_name: plan.name, return_context: input.returnContext ?? "settings", user_id: input.userId,
        billing_period: billingPeriod,
      },
    });

    const price = chargeAmount;
    const suffix = price >= 1000 ? `${(price / 1000).toFixed(0)}K` : String(price);
    const transaction = await this.prisma.payment_transactions.create({
      data: {
        pharmacy_id: input.pharmacyId, subscription_id: input.subscriptionId,
        polar_checkout_id: checkout.id, payment_provider: "polar", amount: price, currency: (plan as any).currency ?? "RWF",
        payment_method: "polar", customer_name: input.customerName, customer_email: input.customerEmail,
        customer_phone: input.customerPhone ?? null,
        payment_details: `${plan.name} subscription — ${suffix}`, status: "pending",
      },
    });

    return { success: true, checkoutUrl: checkout.url, checkoutId: checkout.id, transactionId: transaction.id };
  }

  async checkStatus(checkoutId: string, userId: string) {
    const tx = await this.prisma.payment_transactions.findFirst({ where: { polar_checkout_id: checkoutId } });
    if (!tx || !tx.pharmacy_id) throw new HttpException("Transaction not found", 404);

    const membership = await this.prisma.pharmacy_users.findFirst({ where: { user_id: userId, pharmacy_id: tx.pharmacy_id } });
    if (!membership) throw new HttpException("Forbidden", 403);

    if (tx.status === "completed") {
      return { status: "completed", transaction: { id: tx.id, status: tx.status } };
    }

    if (isPolarConfigured()) {
      try {
        const polar = getPolarClient();
        const checkout = await polar.checkouts.get({ id: checkoutId });
        const status = String(checkout.status ?? "");
        if (status === "succeeded" || status === "confirmed") {
          await this.fulfill(tx.id, tx.subscription_id);
          return { status: "completed", transaction: { id: tx.id, status: "completed" } };
        }
        return { status: status || "pending", transaction: { id: tx.id, status: tx.status } };
      } catch {}
    }
    return { status: tx.status, transaction: { id: tx.id, status: tx.status } };
  }

  async handleWebhook(body: string, headers: Record<string, string>) {
    const secret = process.env.POLAR_WEBHOOK_SECRET?.trim();
    if (!secret) throw new HttpException("Webhook not configured", 500);

    // @ts-ignore - @polar-sh/sdk/webhooks is a valid subpath export but needs moduleResolution: node16
    const { validateEvent, WebhookVerificationError } = await import("@polar-sh/sdk/webhooks");
    let event: { type?: string; data?: Record<string, unknown> };
    try {
      event = validateEvent(body, headers, secret) as typeof event;
    } catch (err) {
      if (err instanceof WebhookVerificationError) throw new HttpException("Invalid signature", 403);
      throw err;
    }

    const type = event.type ?? "";
    const data = (event.data ?? {}) as Record<string, unknown>;

    this.logger.log(`Polar webhook received: ${type}`);

    switch (type) {
      case "checkout.created": {
        const status = String(data.status ?? "");
        if (status === "succeeded" || status === "confirmed") {
          const meta = data.metadata as Record<string, unknown> | undefined;
          const checkoutId = (data.id as string) || undefined;
          const subscriptionId = (meta?.subscription_id as string) || undefined;
          const polarSubId = (data.subscription_id as string) || undefined;
          if (checkoutId && subscriptionId) {
            const tx = await this.prisma.payment_transactions.findFirst({ where: { polar_checkout_id: checkoutId } });
            if (tx) await this.fulfill(tx.id, subscriptionId, polarSubId);
          }
        }
        break;
      }

      case "subscription.created": {
        const polarSubId = (data.id as string) || undefined;
        const meta = data.metadata as Record<string, unknown> | undefined;
        const appSubId = (meta?.subscription_id as string) || undefined;

        if (polarSubId && appSubId) {
          await this.prisma.subscriptions.update({
            where: { id: appSubId },
            data: { polar_subscription_id: polarSubId, updated_at: new Date() },
          }).catch(() => {});
        }
        break;
      }

      case "subscription.updated": {
        const polarSubId = (data.id as string) || undefined;
        if (polarSubId) {
          await this.handleSubscriptionRenewal(polarSubId, data);
        }
        break;
      }

      case "invoice.paid": {
        const invoiceData = data as Record<string, unknown>;
        const subscription = invoiceData.subscription as Record<string, unknown> | undefined;
        const polarSubId = (subscription?.id as string) || undefined;
        if (polarSubId) {
          await this.handleSubscriptionRenewal(polarSubId, data);
        }
        break;
      }

      case "subscription.canceled": {
        const polarSubId = (data.id as string) || undefined;
        if (polarSubId) {
          await this.prisma.subscriptions.updateMany({
            where: { polar_subscription_id: polarSubId },
            data: { cancelled_at: new Date(), cancel_reason: "polar_cancelled", updated_at: new Date() },
          }).catch(() => {});
          const sub = await this.prisma.subscriptions.findFirst({
            where: { polar_subscription_id: polarSubId },
            select: { pharmacy_id: true },
          });
          if (sub?.pharmacy_id) {
            try { this.realtime.broadcastEntitlementsChanged(sub.pharmacy_id); } catch {}
          }
        }
        break;
      }

      default:
        this.logger.debug(`Unhandled Polar webhook event: ${type}`);
    }

    return { received: true };
  }

  private async createInvoiceAndSendReceipt(params: {
    pharmacyId: string;
    amount: number;
    planName: string;
    customerEmail?: string | null;
    customerName?: string | null;
  }) {
    const now = new Date();
    const monthStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const invoiceNumber = `INV-${monthStr}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    try {
      await this.prisma.invoices.create({
        data: {
          pharmacy_id: params.pharmacyId,
          invoice_number: invoiceNumber,
          amount: params.amount,
          status: "paid",
          due_date: now,
          plan_name: params.planName,
        },
      });
      this.logger.log(`Invoice ${invoiceNumber} generated for pharmacy ${params.pharmacyId}`);
    } catch (err) {
      this.logger.error(`Failed to record invoice ${invoiceNumber}: ${err}`);
    }

    let recipientEmail = params.customerEmail;
    let recipientName = params.customerName;

    if (!recipientEmail && params.pharmacyId) {
      const pharmacy = await this.prisma.pharmacies.findUnique({
        where: { id: params.pharmacyId },
        select: { email: true, name: true, owner_id: true },
      });
      if (pharmacy) {
        recipientEmail = pharmacy.email;
        recipientName = recipientName || pharmacy.name;
        if (!recipientEmail && pharmacy.owner_id) {
          const owner = await this.prisma.public_users.findUnique({
            where: { id: pharmacy.owner_id },
            select: { email: true, name: true },
          });
          if (owner) {
            recipientEmail = owner.email;
            recipientName = recipientName || owner.name;
          }
        }
      }
    }

    if (recipientEmail && this.mail.isConfigured()) {
      const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      const formattedAmount = `${params.amount.toLocaleString()} RWF`;
      const html = `
        <div style="font-family: Inter, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
          <div style="border-bottom: 2px solid #0070f3; padding-bottom: 16px; margin-bottom: 24px;">
            <h2 style="color: #0070f3; margin: 0; font-size: 24px;">Pryrox Subscription Receipt</h2>
            <p style="color: #64748b; margin: 4px 0 0 0; font-size: 14px;">Invoice Number: <strong>${invoiceNumber}</strong></p>
          </div>
          <p style="font-size: 15px; color: #1e293b;">Hello ${recipientName || "Valued Customer"},</p>
          <p style="font-size: 15px; color: #334155; line-height: 1.6;">
            Thank you for your payment! Your subscription to <strong>${params.planName}</strong> has been successfully processed and activated.
          </p>
          <div style="background-color: #f8fafc; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Date:</td>
                <td style="padding: 8px 0; color: #0f172a; font-weight: 600; font-size: 14px; text-align: right;">${dateStr}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Plan:</td>
                <td style="padding: 8px 0; color: #0f172a; font-weight: 600; font-size: 14px; text-align: right;">${params.planName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Payment Method:</td>
                <td style="padding: 8px 0; color: #0f172a; font-weight: 600; font-size: 14px; text-align: right;">Card (Polar)</td>
              </tr>
              <tr style="border-top: 1px solid #e2e8f0;">
                <td style="padding: 12px 0 4px 0; color: #0f172a; font-weight: 700; font-size: 16px;">Total Paid:</td>
                <td style="padding: 12px 0 4px 0; color: #16a34a; font-weight: 700; font-size: 18px; text-align: right;">${formattedAmount}</td>
              </tr>
            </table>
          </div>
          <p style="font-size: 14px; color: #64748b;">
            You can view all your billing invoices and manage your subscription anytime in your Pryrox Pharmacy Settings.
          </p>
          <div style="margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
            © ${now.getFullYear()} Pryrox Platform. All rights reserved.
          </div>
        </div>
      `;

      try {
        await this.mail.sendMail({
          to: recipientEmail,
          subject: `Payment Receipt: ${invoiceNumber} — ${params.planName}`,
          html,
        });
        this.logger.log(`Payment receipt email sent to ${recipientEmail} for invoice ${invoiceNumber}`);
      } catch (err) {
        this.logger.error(`Failed to send payment receipt email to ${recipientEmail}: ${err}`);
      }
    }
  }

  private async handleSubscriptionRenewal(polarSubId: string, data: Record<string, unknown>) {
    const sub = await this.prisma.subscriptions.findFirst({
      where: { polar_subscription_id: polarSubId },
      select: { id: true, pharmacy_id: true, billing_period: true, plan_id: true, plan: true },
    });
    if (!sub) {
      this.logger.warn(`No app subscription found for polar_subscription_id: ${polarSubId}`);
      return;
    }

    const now = new Date();
    let newExpiry: Date;
    switch (sub.billing_period) {
      case "yearly":
        newExpiry = new Date(now.getTime() + 365 * 86400000);
        break;
      case "monthly":
      default:
        newExpiry = new Date(now.getTime() + 30 * 86400000);
        break;
    }

    await this.prisma.subscriptions.update({
      where: { id: sub.id },
      data: {
        is_active: true,
        status: "active",
        expires_at: newExpiry,
        renewed_at: now,
        billing_cycle_start: now,
        current_period_start: now,
        current_period_end: newExpiry,
        payment_method: "polar",
        updated_at: now,
      },
    });

    const amount = (data.amount as number) || 0;
    const currency = (data.currency as string) || "RWF";
    await this.prisma.payment_transactions.create({
      data: {
        pharmacy_id: sub.pharmacy_id,
        subscription_id: sub.id,
        payment_provider: "polar",
        payment_method: "polar",
        amount,
        currency,
        customer_name: "Polar renewal",
        status: "completed",
        completed_at: now,
        payment_details: "Polar subscription renewal",
      },
    }).catch(() => {});

    if (sub.pharmacy_id) {
      const planRecord = sub.plan_id ? await this.prisma.subscription_plans.findUnique({ where: { id: sub.plan_id }, select: { name: true } }) : null;
      await this.createInvoiceAndSendReceipt({
        pharmacyId: sub.pharmacy_id,
        amount,
        planName: planRecord?.name ?? sub.plan ?? "Subscription Renewal",
      });
      try { this.realtime.broadcastEntitlementsChanged(sub.pharmacy_id); } catch {}
    }

    this.logger.log(`Subscription ${sub.id} renewed until ${newExpiry.toISOString()}`);
  }

  private async fulfill(transactionId: string, subscriptionId?: string | null, polarSubscriptionId?: string | null) {
    const tx = await this.prisma.payment_transactions.update({
      where: { id: transactionId },
      data: { status: "completed", completed_at: new Date(), payment_provider: "polar" },
    });

    if (subscriptionId) {
      const sub = await this.prisma.subscriptions.findUnique({
        where: { id: subscriptionId },
        select: { pharmacy_id: true, plan_id: true, plan: true, amount: true },
      });
      if (!sub) return;

      const plan = sub.plan_id ? await this.prisma.subscription_plans.findUnique({ where: { id: sub.plan_id }, select: { billing_period: true, name: true } }) : null;
      const billingPeriod = plan?.billing_period ?? "monthly";
      const periodDays = billingPeriod === "yearly" ? 365 : 30;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + periodDays * 86400000);

      await this.prisma.subscriptions.update({
        where: { id: subscriptionId },
        data: {
          is_active: true,
          status: "active",
          billing_period: billingPeriod,
          payment_method: "polar",
          expires_at: expiresAt,
          billing_cycle_start: now,
          current_period_start: now,
          current_period_end: expiresAt,
          ...(polarSubscriptionId ? { polar_subscription_id: polarSubscriptionId } : {}),
          updated_at: now,
        },
      });

      if (sub.pharmacy_id) {
        await this.createInvoiceAndSendReceipt({
          pharmacyId: sub.pharmacy_id,
          amount: Number(tx.amount ?? sub.amount ?? 0),
          planName: plan?.name ?? sub.plan ?? "Subscription",
          customerEmail: tx.customer_email,
          customerName: tx.customer_name,
        });
        try { this.realtime.broadcastEntitlementsChanged(sub.pharmacy_id); } catch {}
      }
    }
  }
}
