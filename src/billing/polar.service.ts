import { Injectable, HttpException, Logger } from "@nestjs/common";
import { Polar } from "@polar-sh/sdk";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeGateway } from "../integrations/realtime.gateway";

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

  private async handleSubscriptionRenewal(polarSubId: string, data: Record<string, unknown>) {
    const sub = await this.prisma.subscriptions.findFirst({
      where: { polar_subscription_id: polarSubId },
      select: { id: true, pharmacy_id: true, billing_period: true },
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
      try { this.realtime.broadcastEntitlementsChanged(sub.pharmacy_id); } catch {}
    }

    this.logger.log(`Subscription ${sub.id} renewed until ${newExpiry.toISOString()}`);
  }

  private async fulfill(transactionId: string, subscriptionId?: string | null, polarSubscriptionId?: string | null) {
    await this.prisma.payment_transactions.update({
      where: { id: transactionId },
      data: { status: "completed", completed_at: new Date(), payment_provider: "polar" },
    });
    if (subscriptionId) {
      const sub = await this.prisma.subscriptions.findUnique({
        where: { id: subscriptionId },
        select: { pharmacy_id: true, plan_id: true },
      });
      if (!sub) return;

      const plan = sub.plan_id ? await this.prisma.subscription_plans.findUnique({ where: { id: sub.plan_id }, select: { billing_period: true } }) : null;
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
        try { this.realtime.broadcastEntitlementsChanged(sub.pharmacy_id); } catch {}
      }
    }
  }
}
