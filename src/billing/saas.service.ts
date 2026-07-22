import { Injectable, HttpException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SaaSService {
  constructor(private readonly prisma: PrismaService) {}

  async getActivePlans() {
    return this.prisma.subscription_plans.findMany({ where: { is_active: true }, orderBy: { price: "asc" } });
  }

  async getPlanById(planId: string) {
    return this.prisma.subscription_plans.findFirst({ where: { id: planId, is_active: true } });
  }

  async createPlan(input: {
    name: string; price: number; billing_period: string; plan_type: string;
    max_branches?: number; max_users?: number; monthly_tx_limit?: number;
    features?: string[]; is_popular?: boolean;
  }) {
    return this.prisma.subscription_plans.create({
      data: {
        name: input.name.trim(), price: input.price, period: input.billing_period,
        plan_type: input.plan_type, max_branches: input.max_branches ?? 1,
        max_users: input.max_users ?? 5, monthly_tx_limit: input.monthly_tx_limit ?? 500,
        features: input.features ?? [], is_popular: input.is_popular ?? false, is_active: true,
      },
    });
  }

  async updatePlan(planId: string, data: Record<string, unknown>) {
    // Get old price before update to detect price changes
    const oldPlan = await this.prisma.subscription_plans.findUnique({
      where: { id: planId },
      select: { name: true, price: true },
    });

    const updateData: Record<string, unknown> = { updated_at: new Date() };
    for (const [key, val] of Object.entries(data)) {
      if (key === "billing_period") updateData["period"] = val;
      else if (key !== "featureKeys") updateData[key] = val;
    }
    const updated = await this.prisma.subscription_plans.update({ where: { id: planId }, data: updateData as never });

    // If price changed, notify all active subscribers — they keep locked price,
    // but should know the renewal price will change
    const newPrice = Number(updated.price ?? 0);
    const oldPrice = Number(oldPlan?.price ?? 0);
    if (oldPrice !== newPrice && oldPlan) {
      const direction = newPrice > oldPrice ? "increased" : "decreased";
      const diff = Math.abs(newPrice - oldPrice);

      // Find all pharmacies actively subscribed to this plan
      const activeSubs = await this.prisma.subscriptions.findMany({
        where: { plan_id: planId, is_active: true },
        select: { pharmacy_id: true },
      });

      const uniquePharmacyIds = [...new Set(activeSubs.map((s) => s.pharmacy_id).filter(Boolean) as string[])];

      // Queue in-app notification for each affected pharmacy
      for (const pharmacyId of uniquePharmacyIds) {
        await this.prisma.notification_outbox.create({
          data: {
            event_type: "subscription.price_changed",
            pharmacy_id: pharmacyId,
            user_id: null, // will go to pharmacy feed
            payload: {
              title: `Plan price ${direction}`,
              message: `The ${oldPlan.name} plan price has ${direction} by ${diff.toLocaleString()} RWF. Your current subscription is locked at ${oldPrice.toLocaleString()} RWF until renewal. At your next renewal, the new price of ${newPrice.toLocaleString()} RWF will apply.`,
              type: direction === "increased" ? "warning" : "info",
              actionUrl: "/pharmacy/billing",
              oldPrice,
              newPrice,
              planName: oldPlan.name,
            } as any,
          },
        });
      }
    }

    return updated;
  }

  async deactivatePlan(planId: string) {
    return this.prisma.subscription_plans.update({ where: { id: planId }, data: { is_active: false, updated_at: new Date() } });
  }

  async activateSubscription(input: { pharmacy_id: string; plan_id: string; subscription_type: string; branch_id?: string }) {
    const plan = await this.prisma.subscription_plans.findUnique({ where: { id: input.plan_id } });
    if (!plan) throw new HttpException("Plan not found", 404);

    // Lock price at subscription time — protects against future plan price changes
    const lockedPrice = Number(plan.price ?? 0);

    return this.prisma.subscriptions.create({
      data: {
        pharmacy_id: input.pharmacy_id,
        plan_id: input.plan_id,
        branch_id: input.branch_id ?? null,
        amount: lockedPrice,           // ← locked price snapshot
        currency: "RWF",
        status: lockedPrice > 0 ? "pending_payment" : "active",
        is_active: lockedPrice <= 0,
        subscription_type: input.subscription_type,
      },
    });
  }

  async getPharmacySubscriptionSummary(pharmacyId: string) {
    // Load all subscriptions with their plans
    const [subs, branches] = await Promise.all([
      this.prisma.subscriptions.findMany({
        where: { pharmacy_id: pharmacyId },
        orderBy: { created_at: "desc" },
      }),
      this.prisma.branches.findMany({
        where: { pharmacy_id: pharmacyId, is_active: true },
        orderBy: [{ is_headquarters: "desc" }, { name: "asc" }],
      }),
    ]);

    // Load plans for all subscriptions
    const planIds = [...new Set(subs.map((s) => s.plan_id).filter(Boolean))] as string[];
    const plans = planIds.length > 0
      ? await this.prisma.subscription_plans.findMany({ where: { id: { in: planIds } } })
      : [];
    const planMap = new Map(plans.map((p) => [p.id, p]));

    // Identify main subscription (not branch_addon, is_active preferred)
    const mainSub = subs.find((s) => s.subscription_type !== "branch_addon" && s.is_active)
      ?? subs.find((s) => s.subscription_type !== "branch_addon");

    // Branch add-on subscriptions
    const branchSubs = subs.filter((s) => s.subscription_type === "branch_addon" && s.is_active);

    // Load branch usage for all active branches
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const branchUsages = await this.prisma.branch_usage.findMany({
      where: {
        branch_id: { in: branches.map((b) => b.id) },
        billing_cycle_start: { gte: periodStart },
      },
    });
    const usageByBranch = new Map(branchUsages.map((u) => [u.branch_id, u]));

    const mainPlan = mainSub?.plan_id ? planMap.get(mainSub.plan_id) : null;

    // Branch limit from main plan
    const mainPlanBranchSlots = mainPlan?.max_branches ?? 1;
    const addonCount = branchSubs.length;
    const branchLimit = mainPlanBranchSlots + addonCount;
    const branchCount = branches.length;

    // Total monthly cost = main plan + branch addons
    const mainCost = mainSub && mainSub.is_active ? Number(mainPlan?.price ?? 0) : 0;
    const addonCost = branchSubs.reduce((sum, s) => {
      const p = s.plan_id ? planMap.get(s.plan_id) : null;
      return sum + Number(p?.price ?? 0);
    }, 0);

    const serialize = (s: typeof subs[number]) => ({
      id: s.id,
      pharmacy_id: s.pharmacy_id,
      plan_id: s.plan_id ?? "",
      branch_id: s.branch_id,
      subscription_type: s.subscription_type,
      status: s.status,
      is_active: s.is_active ?? false,
      current_period_start: s.current_period_start?.toISOString() ?? null,
      current_period_end: s.current_period_end?.toISOString() ?? null,
      cancelled_at: s.cancelled_at?.toISOString() ?? null,
      trial_ends_at: s.trial_ends_at?.toISOString() ?? null,
      created_at: s.created_at?.toISOString() ?? new Date().toISOString(),
      updated_at: s.updated_at?.toISOString() ?? new Date().toISOString(),
      expires_at: s.expires_at?.toISOString() ?? null,
      plan: s.plan_id ? planMap.get(s.plan_id) ?? null : null,
    });

    const serializeBranch = (b: typeof branches[number]) => {
      const usage = usageByBranch.get(b.id);
      return {
        id: b.id,
        pharmacy_id: b.pharmacy_id ?? "",
        name: b.name,
        address: b.address,
        phone: b.phone,
        email: b.email,
        is_active: b.is_active ?? true,
        is_headquarters: b.is_headquarters ?? false,
        is_main_branch: (b as any).is_main_branch ?? false,
        created_at: b.created_at?.toISOString() ?? new Date().toISOString(),
        updated_at: b.updated_at?.toISOString() ?? new Date().toISOString(),
        usage: usage ? {
          id: usage.id,
          branch_id: usage.branch_id,
          pharmacy_id: usage.pharmacy_id ?? "",
          subscription_id: usage.subscription_id,
          billing_cycle_start: usage.billing_cycle_start?.toISOString() ?? "",
          billing_cycle_end: usage.billing_cycle_end?.toISOString() ?? "",
          tx_count: usage.tx_count ?? 0,
          tx_limit: usage.tx_limit ?? 0,
          is_blocked: usage.is_blocked ?? false,
          reset_at: null,
          created_at: usage.created_at?.toISOString() ?? "",
          updated_at: usage.updated_at?.toISOString() ?? "",
        } : null,
      };
    };

    return {
      pharmacy_id: pharmacyId,
      main_subscription: mainSub ? serialize(mainSub) : null,
      branch_subscriptions: branchSubs.map(serialize),
      branches: branches.map(serializeBranch),
      total_monthly_cost: mainCost + addonCost,
      branch_limit: branchLimit,
      branch_count: branchCount,
      can_add_branch: branchCount < branchLimit,
      main_plan_branch_slots: mainPlanBranchSlots,
      addon_subscription_count: addonCount,
    };
  }

  async cancelSubscription(subscriptionId: string, pharmacyId: string) {
    const sub = await this.prisma.subscriptions.findFirst({ where: { id: subscriptionId, pharmacy_id: pharmacyId } });
    if (!sub) throw new HttpException("Subscription not found", 404);
    await this.prisma.subscriptions.update({ where: { id: subscriptionId }, data: { is_active: false, status: "cancelled", updated_at: new Date() } });
  }

  async getAllSubscriptions(params: { status?: string; limit?: number; offset?: number }) {
    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    return this.prisma.subscriptions.findMany({
      where, orderBy: { created_at: "desc" },
      take: params.limit ?? 50, skip: params.offset ?? 0,
    });
  }

  async listBranchesWithUsage(pharmacyId: string) {
    const branches = await this.prisma.branches.findMany({
      where: { pharmacy_id: pharmacyId, is_active: true },
      orderBy: [{ is_headquarters: "desc" }, { name: "asc" }],
    });

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get plan limits from main subscription
    const mainSub = await this.prisma.subscriptions.findFirst({
      where: { pharmacy_id: pharmacyId, is_active: true, subscription_type: { not: "branch_addon" } },
      select: { plan_id: true },
    });
    const plan = mainSub?.plan_id
      ? await this.prisma.subscription_plans.findUnique({
          where: { id: mainSub.plan_id },
          select: { monthly_tx_limit: true },
        })
      : null;
    const planTxLimit = plan?.monthly_tx_limit ?? 0;

    const branchesWithUsage = await Promise.all(
      branches.map(async (b) => {
        const usageRow = await this.prisma.branch_usage.findFirst({
          where: { branch_id: b.id, billing_cycle_start: { gte: periodStart } },
        });
        const txCount = usageRow?.tx_count ?? 0;
        const txLimit = usageRow?.tx_limit ?? planTxLimit;

        return {
          ...b,
          usage: {
            id: usageRow?.id ?? "",
            branch_id: b.id,
            pharmacy_id: b.pharmacy_id ?? pharmacyId,
            subscription_id: usageRow?.subscription_id ?? null,
            billing_cycle_start: usageRow?.billing_cycle_start?.toISOString() ?? periodStart.toISOString(),
            billing_cycle_end: usageRow?.billing_cycle_end?.toISOString() ?? new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
            tx_count: txCount,
            tx_limit: txLimit,
            is_blocked: usageRow?.is_blocked ?? false,
            reset_at: null,
            created_at: usageRow?.created_at?.toISOString() ?? periodStart.toISOString(),
            updated_at: usageRow?.updated_at?.toISOString() ?? periodStart.toISOString(),
          },
        };
      }),
    );
    return { branches: branchesWithUsage, meta: { totalActive: branches.length } };
  }

  async createBranch(pharmacyId: string, data: { name: string; address?: string; phone?: string; email?: string }) {
    return this.prisma.branches.create({
      data: { pharmacy_id: pharmacyId, name: data.name.trim(), address: data.address ?? null, phone: data.phone ?? null, email: data.email ?? null, is_active: true },
    });
  }

  async checkBranchCanTransact(branchId: string) {
    const branch = await this.prisma.branches.findUnique({ where: { id: branchId } });
    if (!branch) {
      return { allowed: false, reason: "Branch not found", message: "Branch not found. Please select a valid branch." };
    }

    // Check monthly transaction usage against plan limit
    const pharmacy = await this.prisma.pharmacies.findUnique({
      where: { id: branch.pharmacy_id ?? "" },
      select: { subscription_plan: true },
    });

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [usage, plan] = await Promise.all([
      this.prisma.branch_usage.findFirst({
        where: { branch_id: branchId, billing_cycle_start: { gte: periodStart } },
        select: { tx_count: true, tx_limit: true, is_blocked: true },
      }),
      this.prisma.subscription_plans.findFirst({
        where: { name: { equals: pharmacy?.subscription_plan ?? "", mode: "insensitive" }, is_active: true },
        select: { monthly_tx_limit: true },
      }),
    ]);

    const txLimit = usage?.tx_limit ?? plan?.monthly_tx_limit ?? 0;
    const txCount = usage?.tx_count ?? 0;
    const isBlocked = usage?.is_blocked ?? false;

    // No limit configured = unlimited
    if (txLimit <= 0) {
      return { allowed: true, tx_count: txCount, tx_limit: 0, remaining: null };
    }

    if (isBlocked || txCount >= txLimit) {
      return {
        allowed: false,
        reason: "limit_reached",
        message: "This branch has reached its monthly transaction limit. Sales are blocked until the billing cycle resets or the plan is upgraded.",
        tx_count: txCount,
        tx_limit: txLimit,
        remaining: 0,
      };
    }

    return {
      allowed: true,
      tx_count: txCount,
      tx_limit: txLimit,
      remaining: Math.max(0, txLimit - txCount),
    };
  }

  async incrementBranchTx(branchId: string) {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const existing = await this.prisma.branch_usage.findFirst({ where: { branch_id: branchId, billing_cycle_start: { gte: periodStart } } });
    if (existing) {
      await this.prisma.branch_usage.update({ where: { id: existing.id }, data: { tx_count: { increment: 1 } } });
    } else {
      const pharmacy = await this.prisma.branches.findUnique({ where: { id: branchId }, select: { pharmacy_id: true } });
      await this.prisma.branch_usage.create({
        data: { branch_id: branchId, pharmacy_id: pharmacy?.pharmacy_id ?? "", tx_count: 1, billing_cycle_start: periodStart, billing_cycle_end: new Date(now.getFullYear(), now.getMonth() + 1, 1) },
      });
    }
    return { success: true };
  }

  async rpcResetMonthlyBranchUsage() {
    const result = await this.prisma.branch_usage.updateMany({ data: { tx_count: 0 } });
    return result.count;
  }

  async saasListSubscriptionInvoices(pharmacyId: string, month?: string) {
    const where: Record<string, unknown> = { pharmacy_id: pharmacyId };
    if (month) {
      const date = new Date(month + "-01");
      where.due_date = { gte: date, lt: new Date(date.getFullYear(), date.getMonth() + 1, 1) };
    }
    const rows = await this.prisma.invoices.findMany({ where, orderBy: { created_at: "desc" } });

    return rows.map((inv) => ({
      id: inv.id,
      pharmacy_id: inv.pharmacy_id ?? pharmacyId,
      invoice_number: inv.invoice_number,
      // Derive billing_month from due_date (YYYY-MM format)
      billing_month: inv.due_date
        ? `${inv.due_date.getFullYear()}-${String(inv.due_date.getMonth() + 1).padStart(2, "0")}`
        : null,
      subtotal: Number(inv.amount ?? 0),
      total: Number(inv.amount ?? 0),
      status: inv.status ?? "pending",
      due_date: inv.due_date?.toISOString() ?? new Date().toISOString(),
      paid_at: (inv as any).paid_at?.toISOString() ?? null,
      notes: (inv as any).notes ?? null,
      plan_name: inv.plan_name ?? null,
      created_at: inv.created_at?.toISOString() ?? new Date().toISOString(),
      updated_at: inv.updated_at?.toISOString() ?? new Date().toISOString(),
      lines: [],
    }));
  }

  async generateMonthlyInvoice(pharmacyId: string, month: string) {
    // Use LOCKED price from subscriptions.amount — not current plan price
    // This protects subscribers from retroactive price changes
    const activeSubs = await this.prisma.subscriptions.findMany({
      where: { pharmacy_id: pharmacyId, is_active: true },
      select: { id: true, plan_id: true, amount: true, subscription_type: true },
    });

    // Total from locked prices (subscription.amount) — not plan.price
    const total = activeSubs.reduce((sum, s) => sum + Number(s.amount ?? 0), 0);

    const date = new Date(month + "-01");
    const dueDate = new Date(date.getFullYear(), date.getMonth() + 1, 1);

    const inv = await this.prisma.invoices.create({
      data: {
        pharmacy_id: pharmacyId,
        invoice_number: `INV-${month.replace("-", "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        amount: total,
        status: "pending",
        due_date: dueDate,
        plan_name: activeSubs.length > 0 ? "Monthly subscription" : "No active plan",
      },
    });

    return {
      id: inv.id,
      pharmacy_id: inv.pharmacy_id ?? pharmacyId,
      invoice_number: inv.invoice_number,
      billing_month: month,
      subtotal: total,
      total,
      status: inv.status ?? "pending",
      due_date: inv.due_date?.toISOString() ?? dueDate.toISOString(),
      paid_at: null,
      notes: null,
      plan_name: inv.plan_name,
      created_at: inv.created_at?.toISOString() ?? new Date().toISOString(),
      updated_at: inv.updated_at?.toISOString() ?? new Date().toISOString(),
      lines: [],
    };
  }
}
