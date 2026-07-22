import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EntitlementError } from "./entitlement.error";
import type {
  AccessBlockReason,
  EntitlementPlan,
  PharmacyEntitlements,
} from "./models";

export type { PharmacyEntitlements } from "./models";

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeStatus(row: {
    status: string | null;
    is_active: boolean | null;
    payment_method: string | null;
    pending_change_status?: string | null;
  }): string {
    if (row.pending_change_status === "scheduled") return "scheduled_change";
    const value = (row.status ?? "").toLowerCase();
    if (value === "pending" || value === "pending_payment") return "pending_payment";
    if (value === "canceled") return "cancelled";
    if (
      ["active", "scheduled_change", "cancelled", "expired", "past_due"].includes(
        value,
      )
    ) {
      return value;
    }
    if (row.payment_method === "pending") return "pending_payment";
    if (row.is_active) return "active";
    return "expired";
  }

  private blockReason(
    pharmacyStatus: string,
    hasSubscription: boolean,
    lifecycle: string | null,
    expired: boolean,
  ): AccessBlockReason {
    if (pharmacyStatus === "inactive") return "pharmacy_inactive";
    if (pharmacyStatus === "suspended") return "pharmacy_suspended";
    if (!hasSubscription) return "no_subscription";
    if (lifecycle === "pending_payment") return "pending_payment";
    if (lifecycle === "cancelled") return "subscription_cancelled";
    if (lifecycle === "past_due") return "past_due";
    if (expired || !["active", "scheduled_change"].includes(lifecycle ?? "")) {
      return "subscription_expired";
    }
    return "none";
  }

  async resolvePharmacyEntitlements(
    pharmacyId: string,
  ): Promise<PharmacyEntitlements> {
    const [pharmacy, candidates, usage, features] = await Promise.all([
      this.prisma.pharmacies.findUnique({
        where: { id: pharmacyId },
        select: { status: true },
      }),
      this.prisma.subscriptions.findMany({
        where: { pharmacy_id: pharmacyId, subscription_type: "main" },
        orderBy: { created_at: "desc" },
        include: {
          subscription_plans_subscriptions_plan_idTosubscription_plans: {
            select: {
              id: true,
              name: true,
              price: true,
              period: true,
              max_users: true,
              max_branches: true,
              monthly_tx_limit: true,
              plan_type: true,
            },
          },
        },
      }),
      Promise.all([
        this.prisma.pharmacy_users.count({
          where: { pharmacy_id: pharmacyId, is_active: true },
        }),
        this.prisma.branches.count({
          where: { pharmacy_id: pharmacyId, is_active: true },
        }),
      ]),
      this.prisma.platform_features.findMany({
        where: { is_active: true },
        orderBy: [{ group: "asc" }, { sort_order: "asc" }],
      }),
    ]);
    const pharmacyStatus = String(pharmacy?.status ?? "active").toLowerCase();
    const eligible = candidates.filter((row) => {
      const plan = row.subscription_plans_subscriptions_plan_idTosubscription_plans;
      return plan?.plan_type !== "branch_addon" && !plan?.name.toLowerCase().includes("branch");
    });
    const main =
      eligible.find((row) => {
        const status = this.normalizeStatus(row);
        return (
          status === "pending_payment" &&
          Number(row.subscription_plans_subscriptions_plan_idTosubscription_plans?.price ?? 0) >
            0
        );
      }) ??
      eligible.find((row) =>
        ["active", "scheduled_change"].includes(this.normalizeStatus(row)),
      ) ??
      eligible.find((row) => row.is_active) ??
      null;

    const planRow =
      main?.subscription_plans_subscriptions_plan_idTosubscription_plans ?? null;
    const plan: EntitlementPlan | null = planRow
      ? {
          id: planRow.id,
          name: planRow.name,
          price: Number(planRow.price),
          period: planRow.period,
          max_users: planRow.max_users ?? undefined,
          max_branches: planRow.max_branches ?? undefined,
          monthly_tx_limit: planRow.monthly_tx_limit,
        }
      : null;
    const lifecycle = main ? this.normalizeStatus(main) : null;
    const expiresAt = main?.expires_at ?? null;
    const isExpired = !expiresAt || expiresAt.getTime() <= Date.now();
    const accessBlockReason = this.blockReason(
      pharmacyStatus,
      Boolean(main),
      lifecycle,
      isExpired,
    );
    const addonSlots = await this.prisma.subscriptions.count({
      where: {
        pharmacy_id: pharmacyId,
        subscription_type: "branch_addon",
        OR: [{ status: "active" }, { status: "pending_payment" }, { is_active: true }],
      },
    });
    const featureRows = plan
      ? await this.prisma.plan_features.findMany({
          where: { plan_id: plan.id, enabled: true },
          select: { feature_key: true },
        })
      : [];
    const booleanKeys = new Set(
      features
        .filter((feature) => feature.feature_type === "boolean")
        .map((feature) => feature.key),
    );
    return {
      pharmacyId,
      pharmacyStatus,
      effectivePlan: plan,
      effectivePlanLabel: (plan?.name ?? main?.plan ?? "standard").toLowerCase(),
      isAccessAllowed: accessBlockReason === "none",
      accessBlockReason,
      isExpired,
      daysRemaining:
        expiresAt && !isExpired
          ? Math.max(
              0,
              Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000),
            )
          : null,
      featureKeys: featureRows
        .map((row) => row.feature_key)
        .filter((key) => booleanKeys.has(key)),
      limits: {
        maxUsers: Number(plan?.max_users ?? 5),
        maxBranches: Number(plan?.max_branches ?? 1),
        monthlyTxPerBranch: Number(plan?.monthly_tx_limit ?? 500),
        totalBranchSlots: Number(plan?.max_branches ?? 1) + addonSlots,
      },
      usage: { activeUsers: usage[0], activeBranches: usage[1] },
    };
  }

  async toSnapshot(entitlements: PharmacyEntitlements) {
    const features = await this.prisma.platform_features.findMany({
      where: { is_active: true },
    });
    const routeFeatureMap: Record<string, string> = {};
    const featureLabels: Record<string, string> = {};
    for (const feature of features) {
      featureLabels[feature.key] = feature.display_name;
      if (feature.feature_type === "boolean") {
        for (const route of feature.nav_routes) {
          if (route) routeFeatureMap[route] = feature.key;
        }
      }
    }
    return { ...entitlements, routeFeatureMap, featureLabels };
  }

  async buildPlatformAdminSnapshot() {
    const features = await this.prisma.platform_features.findMany({
      where: { is_active: true },
    });
    const base: PharmacyEntitlements = {
      pharmacyId: "",
      pharmacyStatus: "active",
      effectivePlan: null,
      effectivePlanLabel: "platform",
      isAccessAllowed: true,
      accessBlockReason: "none",
      isExpired: false,
      daysRemaining: null,
      featureKeys: features.map((feature) => feature.key),
      limits: {
        maxUsers: 999_999,
        maxBranches: 999_999,
        monthlyTxPerBranch: 999_999,
        totalBranchSlots: 999_999,
      },
      usage: { activeUsers: 0, activeBranches: 0 },
    };
    return this.toSnapshot(base);
  }

  async assertEntitlement(input: {
    pharmacyId: string;
    feature?: string;
    limit?: "users" | "branches";
  }): Promise<void> {
    if (process.env.ENTITLEMENTS_ENFORCE === "false" || process.env.ENTITLEMENTS_ENFORCE === "0") {
      return;
    }
    const ent = await this.resolvePharmacyEntitlements(input.pharmacyId);
    if (!ent.isAccessAllowed) {
      throw new EntitlementError("Active subscription required.", "subscription_inactive");
    }
    if (input.feature && !ent.featureKeys.includes(input.feature)) {
      throw new EntitlementError(
        "This feature is not included in your plan. Upgrade to unlock it.",
        "feature_not_in_plan",
        403,
        input.feature,
      );
    }
    if (input.limit) {
      const current =
        input.limit === "users" ? ent.usage.activeUsers : ent.usage.activeBranches;
      const limit =
        input.limit === "users" ? ent.limits.maxUsers : ent.limits.totalBranchSlots;
      if (current >= limit) {
        throw new EntitlementError(
          `Your plan allows up to ${limit} ${input.limit}.`,
          "limit_reached",
        );
      }
    }
  }
}
