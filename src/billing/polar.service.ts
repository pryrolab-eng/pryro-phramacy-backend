import { Injectable, HttpException } from "@nestjs/common";
import { Polar } from "@polar-sh/sdk";
import { PrismaService } from "../prisma/prisma.service";

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
  constructor(private readonly prisma: PrismaService) {}

  getConfig() {
    return { enabled: isPolarConfigured(), server: getPolarServer() };
  }

  async createCheckout(input: {
    pharmacyId: string; userId: string; planId: string; subscriptionId: string;
    returnContext?: string; customerEmail: string; customerName: string; customerPhone?: string;
  }) {
    if (!isPolarConfigured()) {
      throw new HttpException("Card checkout is not configured. Use Mobile Money or contact support.", 503);
    }

    const plan = UUID_RE.test(input.planId)
      ? await this.prisma.subscription_plans.findFirst({ where: { is_active: true, id: input.planId }, select: { id: true, name: true, price: true, polar_product_id: true } })
      : await this.prisma.subscription_plans.findFirst({ where: { is_active: true, name: { equals: input.planId, mode: "insensitive" } }, select: { id: true, name: true, price: true, polar_product_id: true } });

    if (!plan) throw new HttpException("Plan not found", 404);
    if (Number(plan.price) <= 0) throw new HttpException("Free plans do not require Polar checkout.", 400);
    if (!plan.polar_product_id) {
      throw new HttpException(`Plan "${plan.name}" is not synced to Polar yet.`, 400);
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
      },
    });

    const price = Number(plan.price);
    const suffix = price >= 1000 ? `${(price / 1000).toFixed(0)}K` : String(price);
    const transaction = await this.prisma.payment_transactions.create({
      data: {
        pharmacy_id: input.pharmacyId, subscription_id: input.subscriptionId,
        polar_checkout_id: checkout.id, payment_provider: "polar", amount: price, currency: "RWF",
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
    const meta = data.metadata as Record<string, unknown> | undefined;
    const shouldFulfill = type === "checkout.created" && (data.status === "succeeded" || data.status === "confirmed");
    const checkoutId = (data.id as string) || undefined;
    const subscriptionId = (meta?.subscription_id as string) || undefined;

    if (shouldFulfill && subscriptionId) {
      const tx = await this.prisma.payment_transactions.findFirst({ where: { polar_checkout_id: checkoutId } });
      if (tx) await this.fulfill(tx.id, subscriptionId);
    }
    return { received: true, fulfilled: shouldFulfill };
  }

  private async fulfill(transactionId: string, subscriptionId?: string | null) {
    await this.prisma.payment_transactions.update({
      where: { id: transactionId },
      data: { status: "completed", completed_at: new Date(), payment_provider: "polar" },
    });
    if (subscriptionId) {
      await this.prisma.subscriptions.update({
        where: { id: subscriptionId },
        data: { is_active: true, status: "active", payment_method: "polar", updated_at: new Date() },
      });
    }
  }
}
