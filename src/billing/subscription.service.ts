import { Injectable, HttpException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeGateway } from "../integrations/realtime.gateway";

export function billingPeriodDays(billingPeriod: string): number {
  return billingPeriod === "yearly" ? 365 : 30;
}

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private async loadPlan(planId?: string | null) {
    if (!planId) return null;
    return this.prisma.subscription_plans.findUnique({ where: { id: planId } });
  }

  async getPlanLimits(pharmacyId: string) {
    const pharmacy = await this.prisma.pharmacies.findUnique({
      where: { id: pharmacyId },
      select: { subscription_plan: true },
    });
    const planName = pharmacy?.subscription_plan ?? "free";
    const plan = await this.prisma.subscription_plans.findFirst({
      where: { name: { equals: planName, mode: "insensitive" }, is_active: true },
    });
    const limits = {
      maxUsers: plan?.max_users ?? 3,
      maxBranches: plan?.max_branches ?? 1,
      monthlyTxLimit: plan?.monthly_tx_limit ?? 200,
    };
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [userCount, branchCount, usageAgg] = await Promise.all([
      this.prisma.pharmacy_users.count({ where: { pharmacy_id: pharmacyId } }),
      this.prisma.branches.count({ where: { pharmacy_id: pharmacyId, is_active: true } }),
      this.prisma.branch_usage.aggregate({
        where: { pharmacy_id: pharmacyId, billing_cycle_start: { gte: monthStart } },
        _sum: { tx_count: true },
      }),
    ]);
    return {
      limits,
      usage: { users: userCount, branches: branchCount, monthlyTransactions: usageAgg._sum.tx_count ?? 0 },
      canAddUser: userCount < limits.maxUsers,
    };
  }

  async getStatus(pharmacyId: string) {
    const subscription = await this.prisma.subscriptions.findFirst({
      where: { pharmacy_id: pharmacyId, is_active: true },
      orderBy: { created_at: "desc" },
    });

    if (!subscription) {
      return {
        status: "free",
        plan: { name: "Free", price: 0, period: "forever", features: ["Basic POS", "Up to 3 users", "Email support"] },
        daysRemaining: null, isActive: true, expiresAt: null, scheduledChange: null,
      };
    }

    const now = new Date();
    const expiresAt = subscription.expires_at ? new Date(subscription.expires_at) : null;
    const daysRemaining = expiresAt ? Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000) : null;
    const isExpired = expiresAt ? daysRemaining! <= 0 : false;
    const plan = subscription.plan_id ? await this.loadPlan(subscription.plan_id) : null;
    const recentPayments = await this.prisma.payments.findMany({
      where: { pharmacy_id: pharmacyId },
      orderBy: { created_at: "desc" },
      take: 5,
    });

    let scheduledChange = null;
    if (subscription.next_plan_id && subscription.change_scheduled_at && subscription.change_type) {
      const targetPlan = await this.loadPlan(subscription.next_plan_id);
      scheduledChange = {
        status: subscription.pending_change_status ?? "pending",
        effectiveAt: subscription.change_scheduled_at.toISOString(),
        changeType: subscription.change_type,
        currentPlan: plan?.name ?? "Unknown",
        targetPlan: targetPlan?.name ?? "Unknown",
        subscriptionId: subscription.id,
      };
    }

    return {
      status: isExpired ? "expired" : "active",
      plan,
      daysRemaining: daysRemaining != null ? Math.max(0, daysRemaining) : null,
      isActive: Boolean(subscription.is_active) && !isExpired,
      expiresAt: subscription.expires_at,
      subscription: {
        id: subscription.id, startedAt: subscription.created_at,
        lastPayment: recentPayments[0]?.created_at ?? null,
        paymentHistory: recentPayments.length,
      },
      timeCounter: expiresAt ? {
        days: Math.max(0, daysRemaining ?? 0),
        hours: Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 3600000) % 24),
        minutes: Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 60000) % 60),
        isExpiring: daysRemaining != null && daysRemaining <= 7 && daysRemaining > 0,
        isExpired,
      } : null,
      scheduledChange,
    };
  }

  /**
   * Deactivate all existing active main subscriptions for a pharmacy.
   * Called before creating a new subscription on upgrade or renew.
   */
  private async deactivateExistingSubscriptions(pharmacyId: string) {
    await this.prisma.subscriptions.updateMany({
      where: { pharmacy_id: pharmacyId, is_active: true, subscription_type: "main" },
      data: { is_active: false, updated_at: new Date() },
    });
  }

  /**
   * Upgrade to a different plan (or first-time subscribe).
   * Deactivates the old subscription and creates a new one.
   */
  async upgrade(pharmacyId: string, planId: string, paymentTransactionId?: string) {
    const plan = await this.loadPlan(planId);
    if (!plan) throw new HttpException("Plan not found", 404);

    const requiresPayment = Number(plan.price) > 0;
    const periodDays = billingPeriodDays(plan.billing_period);

    await this.deactivateExistingSubscriptions(pharmacyId);

    const subscription = await this.prisma.subscriptions.create({
      data: {
        pharmacy_id: pharmacyId,
        plan_id: plan.id,
        billing_period: plan.billing_period,
        status: requiresPayment ? "pending_payment" : "active",
        is_active: !requiresPayment,
        expires_at: requiresPayment ? null : new Date(Date.now() + periodDays * 86400000),
        payment_method: paymentTransactionId ? "polar" : null,
        subscription_type: "main",
      },
    });

    if (!requiresPayment) {
      try { this.realtime.broadcastEntitlementsChanged(pharmacyId); } catch { /* non-fatal */ }
    }

    return {
      success: true,
      subscription: requiresPayment
        ? { id: subscription.id, planId: plan.id, planName: plan.name, amount: Number(plan.price), requiresPayment: true, isActive: false, expiresAt: null, status: subscription.status }
        : { id: subscription.id, planId: plan.id, planName: plan.name, amount: 0, requiresPayment: false, isActive: true, expiresAt: subscription.expires_at, status: "active" },
    };
  }

  /**
   * Renew the current plan — extends the billing period without changing tier.
   * If the plan has a Polar product, a checkout is required.
   */
  async renew(pharmacyId: string, planId: string, paymentTransactionId?: string) {
    const plan = await this.loadPlan(planId);
    if (!plan) throw new HttpException("Plan not found", 404);

    const requiresPayment = Number(plan.price) > 0;
    const periodDays = billingPeriodDays(plan.billing_period);

    await this.deactivateExistingSubscriptions(pharmacyId);

    const now = new Date();
    const subscription = await this.prisma.subscriptions.create({
      data: {
        pharmacy_id: pharmacyId,
        plan_id: plan.id,
        billing_period: plan.billing_period,
        status: requiresPayment ? "pending_payment" : "active",
        is_active: !requiresPayment,
        expires_at: requiresPayment ? null : new Date(now.getTime() + periodDays * 86400000),
        payment_method: paymentTransactionId ? "polar" : null,
        subscription_type: "main",
        renewed_at: now,
        billing_cycle_start: now,
        current_period_start: now,
        current_period_end: new Date(now.getTime() + periodDays * 86400000),
      },
    });

    if (!requiresPayment) {
      try { this.realtime.broadcastEntitlementsChanged(pharmacyId); } catch { /* non-fatal */ }
    }

    return {
      success: true,
      subscription: requiresPayment
        ? { id: subscription.id, planId: plan.id, planName: plan.name, amount: Number(plan.price), requiresPayment: true, isActive: false, expiresAt: null, status: subscription.status }
        : { id: subscription.id, planId: plan.id, planName: plan.name, amount: 0, requiresPayment: false, isActive: true, expiresAt: subscription.expires_at, status: "active" },
    };
  }

  /**
   * Cancel auto-renewal. The subscription remains active until expires_at.
   */
  async cancel(pharmacyId: string) {
    const active = await this.prisma.subscriptions.findFirst({
      where: { pharmacy_id: pharmacyId, is_active: true },
      orderBy: { created_at: "desc" },
    });
    if (!active) throw new HttpException("No active subscription to cancel", 404);

    const updated = await this.prisma.subscriptions.update({
      where: { id: active.id },
      data: {
        cancelled_at: new Date(),
        cancel_reason: "user_cancelled",
        next_plan_id: null,
        change_type: null,
        change_scheduled_at: null,
        pending_change_status: null,
        updated_at: new Date(),
      },
    });

    return {
      success: true,
      cancelled: true,
      activeUntil: updated.expires_at,
      subscriptionId: updated.id,
    };
  }

  async scheduleDowngrade(pharmacyId: string, targetPlanId: string) {
    const plan = await this.loadPlan(targetPlanId);
    if (!plan) throw new HttpException("Plan not found", 404);

    const active = await this.prisma.subscriptions.findFirst({
      where: { pharmacy_id: pharmacyId, is_active: true },
      orderBy: { created_at: "desc" },
    });
    if (!active) throw new HttpException("No active subscription", 400);
    const currentPlan = active.plan_id ? await this.loadPlan(active.plan_id) : null;

    const effectiveAt = new Date(Date.now() + 30 * 86400000);
    await this.prisma.subscriptions.update({
      where: { id: active.id },
      data: { next_plan_id: targetPlanId, change_type: "downgrade", change_scheduled_at: effectiveAt, pending_change_status: "pending", updated_at: new Date() },
    });

    return {
      success: true, effectiveAt: effectiveAt.toISOString(), replaced: false,
      currentPlan: currentPlan?.name ?? "Unknown", scheduledPlan: plan.name, subscriptionId: active.id,
    };
  }

  async getScheduledChange(pharmacyId: string) {
    const active = await this.prisma.subscriptions.findFirst({
      where: { pharmacy_id: pharmacyId, is_active: true, next_plan_id: { not: null } },
      orderBy: { created_at: "desc" },
    });
    if (!active?.next_plan_id || !active.change_scheduled_at) return { scheduledChange: null };

    const [targetPlan, currentPlan] = await Promise.all([
      this.loadPlan(active.next_plan_id),
      active.plan_id ? this.loadPlan(active.plan_id) : null,
    ]);
    return {
      scheduledChange: {
        status: active.pending_change_status ?? "pending",
        effectiveAt: active.change_scheduled_at.toISOString(),
        changeType: active.change_type ?? "change",
        currentPlan: currentPlan?.name ?? "Unknown",
        targetPlan: targetPlan?.name ?? "Unknown",
        subscriptionId: active.id,
      },
    };
  }

  async cancelScheduledChange(pharmacyId: string) {
    const active = await this.prisma.subscriptions.findFirst({
      where: { pharmacy_id: pharmacyId, is_active: true, next_plan_id: { not: null } },
      orderBy: { created_at: "desc" },
    });
    if (!active?.next_plan_id) return { canceled: false };
    await this.prisma.subscriptions.update({
      where: { id: active.id },
      data: { next_plan_id: null, change_type: null, change_scheduled_at: null, pending_change_status: null, updated_at: new Date() },
    });
    return { canceled: true };
  }

  async branchAddon(pharmacyId: string, planId: string, branchId?: string, branch?: { name?: string; address?: string; phone?: string; email?: string }) {
    const plan = await this.prisma.subscription_plans.findFirst({
      where: { id: planId, plan_type: "branch_addon", is_active: true },
    });
    if (!plan) throw new HttpException("Branch add-on plan not found or is not available", 404);

    let targetBranchId = branchId;
    if (!targetBranchId && branch?.name) {
      const created = await this.prisma.branches.create({
        data: { pharmacy_id: pharmacyId, name: branch.name, address: branch.address ?? null, phone: branch.phone ?? null, email: branch.email ?? null, is_active: true },
      });
      targetBranchId = created.id;
    }
    if (!targetBranchId) throw new HttpException("Provide branchId or branch.name", 400);

    const subscription = await this.prisma.subscriptions.create({
      data: {
        pharmacy_id: pharmacyId, plan_id: plan.id, branch_id: targetBranchId,
        status: Number(plan.price) > 0 ? "pending_payment" : "active", is_active: Number(plan.price) <= 0,
        subscription_type: "branch_addon",
      },
    });
    return { success: true, subscription: { id: subscription.id, requiresPayment: Number(plan.price) > 0 } };
  }
}
