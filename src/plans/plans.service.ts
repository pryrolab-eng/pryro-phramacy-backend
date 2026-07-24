import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const DEFAULT_PLANS = [
  {
    name: "Free",
    price: 0,
    period: "forever",
    features: [
      "Basic POS",
      "Up to 3 users",
      "Email support",
      "Basic reports",
    ],
    is_popular: false,
    max_branches: 1,
    max_users: 3,
    monthly_tx_limit: 200,
  },
  {
    name: "Standard",
    price: 50000,
    period: "per month",
    features: [
      "Full POS",
      "Up to 10 users",
      "Insurance integration",
      "Phone support",
      "Advanced reports",
    ],
    is_popular: true,
    max_branches: 5,
    max_users: 15,
    monthly_tx_limit: 2000,
  },
  {
    name: "Premium",
    price: 120000,
    period: "per month",
    features: [
      "Everything in Standard",
      "Unlimited users",
      "Advanced analytics",
      "Priority support",
      "Custom integrations",
    ],
    is_popular: false,
    max_branches: 15,
    max_users: 50,
    monthly_tx_limit: 5000,
  },
];

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlans() {
    const dbPlans = await this.prisma.subscription_plans.findMany({
      where: { is_active: true },
      orderBy: { price: "asc" },
    });

    if (dbPlans.length > 0) {
      return dbPlans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        price: Number(plan.price),
        currency: (plan as any).currency ?? "RWF",
        yearly_price: plan.yearly_price ? Number(plan.yearly_price) : null,
        yearly_discount_pct: plan.yearly_discount_pct,
        period: plan.period ?? "per month",
        billing_period: plan.billing_period ?? "monthly",
        features: plan.features ?? [],
        is_popular: plan.is_popular ?? false,
        is_active: plan.is_active ?? true,
        plan_type: plan.plan_type ?? "main",
        monthly_tx_limit: plan.monthly_tx_limit ?? null,
        max_users: plan.max_users ?? null,
        max_branches: plan.max_branches ?? null,
      }));
    }

    return DEFAULT_PLANS.map((plan, index) => ({
      ...plan,
      id: `fallback-${index + 1}`,
      is_active: true,
      plan_type: "main",
    }));
  }
}
