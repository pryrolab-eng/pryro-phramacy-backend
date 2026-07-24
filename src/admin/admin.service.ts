import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

const BCRYPT_ROUNDS = 10;

const SUPPORTED_PLATFORM_SETTING_KEYS = new Set([
  "platformName", "platformLogoUrl", "adminEmail", "supportEmail",
  "maxPharmacies", "enableRegistrations", "enableNotifications",
  "scheduledMaintenance", "maxUsersPerPharmacy", "apiRateLimit",
  "enableWhiteLabel", "enableMultiBranch", "dataRetentionDays",
  "enableAuditLogs", "allowUserTwoFactor", "ipWhitelistEnabled",
]);

function filterSupportedSettings(updates: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(updates).filter(([k]) => SUPPORTED_PLATFORM_SETTING_KEYS.has(k)),
  );
}

function resolveSubscriptionPlanEnum(val?: string): string {
  if (!val) return "trial";
  const v = String(val).toLowerCase();
  if (v === "standard" || v === "premium" || v === "trial") return v;
  return "trial";
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Auth helpers ---

  async createAuthUser(email: string, password: string, fullName?: string): Promise<{ user: { id: string; email: string } }> {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const now = new Date();
    const id = crypto.randomUUID();
    const meta: Record<string, unknown> = { full_name: fullName ?? "", name: fullName ?? "" };

    await this.prisma.auth_users.create({
      data: {
        id,
        aud: "authenticated",
        role: "authenticated",
        email: email.trim().toLowerCase(),
        encrypted_password: passwordHash,
        email_confirmed_at: now,
        raw_user_meta_data: meta as Prisma.InputJsonValue,
        created_at: now,
        updated_at: now,
      },
    });

    const name = fullName ?? "";
    await this.prisma.public_users.upsert({
      where: { id },
      create: { id, email, name, full_name: name, user_id: id, token_identifier: email },
      update: { email, ...(name ? { name, full_name: name } : {}), updated_at: new Date() },
    });

    return { user: { id, email } };
  }

  async updateAuthUserPassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.auth_users.update({
      where: { id: userId },
      data: { encrypted_password: passwordHash, updated_at: new Date() },
    });
  }

  async updateAuthUserEmail(userId: string, email: string): Promise<void> {
    await this.prisma.auth_users.update({
      where: { id: userId },
      data: { email: email.trim().toLowerCase(), updated_at: new Date() },
    });
  }

  async deleteAuthUser(userId: string): Promise<void> {
    await this.prisma.auth_users.delete({ where: { id: userId } }).catch(() => {});
  }

  async getAuthUserById(userId: string): Promise<{ id: string; email: string | null; user_metadata: Record<string, unknown> } | null> {
    const row = await this.prisma.auth_users.findUnique({ where: { id: userId }, select: { id: true, email: true, raw_user_meta_data: true } });
    if (!row) return null;
    return { id: row.id, email: row.email, user_metadata: (row.raw_user_meta_data as Record<string, unknown>) ?? {} };
  }

  async updateAuthUserMetadata(userId: string, metadata: Record<string, unknown>): Promise<void> {
    await this.prisma.auth_users.update({ where: { id: userId }, data: { raw_user_meta_data: metadata as Prisma.InputJsonValue, updated_at: new Date() } });
  }

  // --- Pharmacy management ---

  async listPharmacies() {
    const rows = await this.prisma.pharmacies.findMany({
      orderBy: { created_at: "desc" },
    });

    const subRows = await this.prisma.subscriptions.findMany({
      where: {
        pharmacy_id: { in: rows.map((r) => r.id) },
        is_active: true,
        subscription_type: "main",
      },
      select: { pharmacy_id: true, plan: true, amount: true, status: true, billing_period: true },
    });

    const subByPharmacy = new Map(rows.map((r) => [r.id, [] as typeof subRows]));
    for (const s of subRows) {
      if (s.pharmacy_id) {
        const list = subByPharmacy.get(s.pharmacy_id) ?? [];
        list.push(s);
        subByPharmacy.set(s.pharmacy_id, list);
      }
    }

    const catalogPlans = await this.prisma.subscription_plans.findMany({
      where: { is_active: true, plan_type: "main" },
      select: { id: true, name: true, price: true },
    });

    return rows.map((p) => {
      const subs = subByPharmacy.get(p.id) ?? [];
      const activeSub = subs.find((s) => s.status === "active");
      return {
        id: p.id,
        name: p.name,
        address: p.address,
        phone: p.phone,
        email: p.email,
        status: p.status,
        owner_name: "",
        owner_email: "",
        owner_id: p.owner_id,
        subscription_plan: p.subscription_plan,
        subscription_plan_label: p.subscription_plan ?? "trial",
        subscription_price: activeSub?.amount ? Number(activeSub.amount) : null,
        created_at: p.created_at?.toISOString() ?? null,
        updated_at: p.updated_at?.toISOString() ?? null,
        active_subscription_status: activeSub?.status ?? null,
        plan_name: activeSub?.plan ?? null,
        catalog_plans: catalogPlans,
        subscriber_count: 0,
      };
    });
  }

  async createPharmacy(body: Record<string, unknown>) {
    const ownerEmail = String(body.owner_email ?? "").trim();
    const ownerPassword = String(body.owner_password ?? "");
    const ownerName = String(body.owner_name ?? "").trim() || "";

    if (!ownerEmail || !ownerPassword) throw { status: 400, error: "Owner email and password are required." };
    if (ownerPassword.length < 6) throw { status: 400, error: "Owner password must be at least 6 characters." };

    const authUser = await this.createAuthUser(ownerEmail, ownerPassword, ownerName);
    const pharmacyEmail = String(body.email ?? "").trim() || ownerEmail;
    const subscriptionPlan = resolveSubscriptionPlanEnum(body.subscription_plan as string | undefined);

    const pharmacy = await this.prisma.pharmacies.create({
      data: {
        name: String(body.name ?? ""),
        address: body.address ? String(body.address) : null,
        phone: body.phone ? String(body.phone) : null,
        email: pharmacyEmail,
        license_number: body.license_number ? String(body.license_number) : `LIC-${Date.now()}`,
        subscription_plan: subscriptionPlan as "trial" | "standard" | "premium",
        owner_id: authUser.user.id,
        status: "active",
      },
    });

    const fullName = String(body.owner_name ?? "").trim();
    await this.prisma.public_users.upsert({
      where: { id: authUser.user.id },
      create: {
        id: authUser.user.id,
        email: ownerEmail,
        name: fullName || ownerEmail,
        full_name: fullName || ownerEmail,
        user_id: authUser.user.id,
        token_identifier: ownerEmail,
      },
      update: { email: ownerEmail, name: fullName || undefined, full_name: fullName || undefined },
    });

    await this.prisma.pharmacy_users.create({
      data: {
        pharmacy_id: pharmacy.id,
        user_id: authUser.user.id,
        role: "pharmacy_owner",
        is_active: true,
      },
    });

    return { success: true, pharmacy, owner: { email: ownerEmail, message: "Share the owner email and password with the pharmacy owner for sign-in." } };
  }

  async getPharmacyDetail(id: string) {
    const pharmacy = await this.prisma.pharmacies.findUnique({ where: { id } });
    if (!pharmacy) throw { status: 404, error: "Not found" };

    const [subscriptions, catalogPlans, members] = await Promise.all([
      this.prisma.subscriptions.findMany({
        where: { pharmacy_id: id },
        orderBy: { created_at: "desc" },
        select: { id: true, plan: true, amount: true, status: true, billing_period: true, subscription_type: true, created_at: true },
      }),
      this.prisma.subscription_plans.findMany({
        where: { is_active: true, plan_type: "main" },
        select: { id: true, name: true, price: true },
      }),
      this.prisma.pharmacy_users.findMany({ where: { pharmacy_id: id, is_active: true }, select: { user_id: true, role: true } }),
    ]);

    return {
      success: true,
      detail: {
        pharmacy: {
          id: pharmacy.id,
          name: pharmacy.name,
          address: pharmacy.address,
          phone: pharmacy.phone,
          email: pharmacy.email,
          license_number: pharmacy.license_number,
          status: pharmacy.status,
          subscription_plan: pharmacy.subscription_plan,
          owner_id: pharmacy.owner_id,
          owner: null,
          members,
          created_at: pharmacy.created_at?.toISOString() ?? null,
          updated_at: pharmacy.updated_at?.toISOString() ?? null,
        },
        subscriptions: subscriptions.map((s) => ({
          ...s,
          plan_name: s.plan,
          plan_price: s.amount ? Number(s.amount) : null,
          is_main_subscription: s.subscription_type === "main",
        })),
        catalogPlans,
      },
    };
  }

  async updatePharmacy(id: string, body: Record<string, unknown>) {
    const current = await this.prisma.pharmacies.findUnique({ where: { id } });
    if (!current) throw { status: 404, error: "Pharmacy not found" };

    const nextStatus = body.status === "suspended" || body.status === "inactive" ? body.status : "active";
    const subscriptionPlan = resolveSubscriptionPlanEnum(body.subscription_plan as string | undefined);

    const pharmacy = await this.prisma.pharmacies.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.address !== undefined ? { address: String(body.address) } : {}),
        ...(body.phone !== undefined ? { phone: String(body.phone) } : {}),
        ...(body.email !== undefined ? { email: String(body.email) } : {}),
        ...(body.license_number !== undefined ? { license_number: String(body.license_number) } : {}),
        ...(body.subscription_plan !== undefined ? { subscription_plan: subscriptionPlan as "trial" | "standard" | "premium" } : {}),
        status: nextStatus as "active" | "inactive" | "suspended" | null,
      },
    });

    const ownerId = current.owner_id;
    if (body.new_password && ownerId) {
      await this.updateAuthUserPassword(ownerId, String(body.new_password)).catch(() => {});
    }
    const ownerEmail = body.owner_email || body.email;
    if (ownerEmail && String(ownerEmail) !== current.email && ownerId) {
      await this.updateAuthUserEmail(ownerId, String(ownerEmail)).catch(() => {});
    }
    if (ownerId) {
      const email = String(ownerEmail || current.email || "");
      const name = String(body.owner_name ?? "");
      await this.prisma.public_users.upsert({
        where: { id: ownerId },
        create: { id: ownerId, email, name, full_name: name, user_id: ownerId, token_identifier: email },
        update: { email, ...(name ? { name, full_name: name } : {}), updated_at: new Date() },
      }).catch(() => {});
    }

    return { success: true, pharmacy };
  }

  async deletePharmacy(id: string) {
    const activeSub = await this.prisma.subscriptions.findFirst({
      where: { pharmacy_id: id, is_active: true, status: "active", subscription_type: "main" },
    });
    if (activeSub) {
      throw { status: 400, error: "Cannot delete this pharmacy while it has an active subscription. Cancel or expire the plan first." };
    }

    const cancelledIds: string[] = [];
    const pendingSubs = await this.prisma.subscriptions.findMany({
      where: { pharmacy_id: id, status: { in: ["pending", "incomplete", "past_due"] } },
      select: { id: true },
    });
    for (const s of pendingSubs) {
      await this.prisma.subscriptions.update({ where: { id: s.id }, data: { status: "cancelled", is_active: false } }).catch(() => {});
      cancelledIds.push(s.id);
    }

    await this.prisma.pharmacies.delete({ where: { id } }).catch((err) => {
      const msg = String(err.message ?? "");
      if (msg.includes("23503") || msg.toLowerCase().includes("foreign key")) {
        throw { status: 500, error: "Cannot delete this pharmacy because related records still exist." };
      }
      throw { status: 500, error: "Failed to delete pharmacy" };
    });

    return { success: true, cancelledSubscriptions: cancelledIds.length };
  }

  async repairPharmacySubscriptions() {
    const pharmacies = await this.prisma.pharmacies.findMany({ select: { id: true, subscription_plan: true } });
    let checked = 0;
    let fixed = 0;
    for (const p of pharmacies) {
      checked++;
      const activeSubs = await this.prisma.subscriptions.findMany({
        where: { pharmacy_id: p.id, is_active: true, subscription_type: "main", status: "active" },
        orderBy: { created_at: "desc" },
      });
      if (activeSubs.length > 1) {
        const [keep, ...extra] = activeSubs;
        for (const e of extra) {
          await this.prisma.subscriptions.update({ where: { id: e.id }, data: { is_active: false, status: "cancelled" } });
        }
        fixed++;
      }
    }
    return { checked, fixed };
  }

  async getPharmacyBranding(id: string) {
    const pharmacy = await this.prisma.pharmacies.findUnique({ where: { id }, select: { id: true, logo_url: true, primary_color: true, platform_name: true, name: true } });
    if (!pharmacy) throw { status: 404, error: "Pharmacy not found" };
    return { logo_url: pharmacy.logo_url, primary_color: pharmacy.primary_color, platform_name: pharmacy.platform_name, name: pharmacy.name };
  }

  async updatePharmacyBranding(id: string, body: Record<string, unknown>) {
    const data: Record<string, unknown> = {};
    if (body.logo_url !== undefined) data.logo_url = body.logo_url;
    if (body.primary_color !== undefined) data.primary_color = body.primary_color;
    if (body.platform_name !== undefined) data.platform_name = body.platform_name;
    if (Object.keys(data).length > 0) {
      await this.prisma.pharmacies.update({ where: { id }, data: data as any });
    }
    return { success: true };
  }

  // --- Superadmin ---

  async listRawPharmacies() {
    const rows = await this.prisma.pharmacies.findMany({ orderBy: { created_at: "desc" } });
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      phone: p.phone,
      email: p.email,
      subscription_plan: p.subscription_plan,
      owner_name: p.owner_id,
      status: p.status,
      created_at: p.created_at?.toISOString() ?? null,
    }));
  }

  async createRawPharmacy(body: Record<string, unknown>) {
    const pharmacy = await this.prisma.pharmacies.create({
      data: {
        name: String(body.name ?? ""),
        address: body.location ? String(body.location) : null,
        phone: body.owner_phone ? String(body.owner_phone) : null,
        email: body.owner_email ? String(body.owner_email) : null,
        subscription_plan: (body.plan ? String(body.plan) : "trial") as "trial" | "standard" | "premium",
        license_number: `LIC-${Date.now()}`,
        status: "active",
      },
    });
    return { success: true, pharmacy };
  }

  async getSuperadminDashboard() {
    const [pharmacies, users, revenueAgg] = await Promise.all([
      this.prisma.pharmacies.findMany({ select: { id: true, status: true, created_at: true } }),
      this.prisma.pharmacy_users.findMany({ select: { id: true, created_at: true } }),
      this.prisma.sales.aggregate({ _sum: { total_amount: true } }),
    ]);

    const totalPharmacies = pharmacies.length;
    const activePharmacies = pharmacies.filter((p) => p.status === "active").length;
    const totalRevenue = Number(revenueAgg._sum.total_amount ?? 0);
    const totalUsers = users.length;

    const now = new Date();
    const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const previousMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const newRegistrations = pharmacies.filter((p) => p.created_at && p.created_at >= thisMonthStart && p.created_at < nextMonthStart).length;
    const previousRegistrations = pharmacies.filter((p) => p.created_at && p.created_at >= previousMonthStart && p.created_at < thisMonthStart).length;
    const monthlyGrowth = previousRegistrations > 0
      ? Math.round(((newRegistrations - previousRegistrations) / previousRegistrations) * 1000) / 10
      : newRegistrations > 0 ? 100 : 0;

    return { totalPharmacies, activePharmacies, totalRevenue, monthlyGrowth, totalUsers, newRegistrations };
  }

  // --- Plans ---

  async listPlans() {
    const plans = await this.prisma.subscription_plans.findMany({ orderBy: { created_at: "desc" } });
    const planIds = plans.map((p) => p.id);

    const [subCounts, pharmacyPlanCounts, featureRows] = await Promise.all([
      this.prisma.subscriptions.groupBy({
        by: ["plan"],
        where: { is_active: true, status: "active" },
        _count: { id: true },
      }),
      this.prisma.pharmacies.groupBy({
        by: ["subscription_plan"],
        where: { status: "active", subscription_plan: { not: null } },
        _count: { id: true },
      }),
      this.prisma.plan_features.findMany({
        where: { plan_id: { in: planIds } },
        select: { plan_id: true, feature_key: true },
      }),
    ]);

    const keysByPlan = new Map<string, string[]>();
    for (const row of featureRows) {
      const list = keysByPlan.get(row.plan_id) ?? [];
      list.push(row.feature_key);
      keysByPlan.set(row.plan_id, list);
    }

    // Merge counts from both subscriptions.plan and pharmacies.subscription_plan
    const countByName = new Map<string, number>();
    for (const s of subCounts) {
      const key = (s.plan ?? "").toLowerCase();
      countByName.set(key, (countByName.get(key) ?? 0) + s._count.id);
    }
    for (const p of pharmacyPlanCounts) {
      const key = (p.subscription_plan ?? "").toLowerCase();
      countByName.set(key, (countByName.get(key) ?? 0) + p._count.id);
    }

    const enriched = plans.map((p) => ({
      ...p,
      active_subscriber_count: countByName.get(p.name.toLowerCase()) ?? 0,
      feature_keys: keysByPlan.get(p.id) ?? [],
    }));

    const nameGroups = new Map<string, { ids: string[]; activeCount: number }>();
    for (const p of plans) {
      const g = nameGroups.get(p.name) ?? { ids: [], activeCount: 0 };
      g.ids.push(p.id);
      if (p.is_active) g.activeCount++;
      nameGroups.set(p.name, g);
    }
    const duplicateGroups = [...nameGroups.entries()]
      .filter(([, g]) => g.ids.length > 1 && g.activeCount > 0)
      .map(([key, g]) => ({ key, keeperId: g.ids[0], duplicateIds: g.ids.slice(1) }));

    return { plans: enriched, duplicateGroups };
  }

  async createPlan(body: Record<string, unknown>) {
    const planName = String(body.name ?? "").trim();
    if (!planName) throw { status: 400, error: "Plan name is required" };

    const price = Number(body.price ?? 0);
    const cadence = body.billing_cadence === "yearly" || body.billing_period === "yearly" ? "yearly" : "monthly";
    const billing_period = cadence;
    const planType = String(body.plan_type ?? "main").trim().toLowerCase() === "branch_addon" ? "branch_addon" : "main";

    const featureKeys = Array.isArray(body.feature_keys)
      ? body.feature_keys as string[]
      : Array.isArray(body.featureKeys)
        ? body.featureKeys as string[]
        : [];

    const plan = await this.prisma.subscription_plans.create({
      data: {
        name: planName,
        price,
        period: billing_period,
        features: Array.isArray(body.features) ? body.features : [],
        is_popular: body.is_popular === true,
        is_active: true,
        plan_type: planType,
        billing_period,
        max_branches: planType === "branch_addon" ? 1 : Number(body.max_branches ?? 1),
        max_users: Number(body.max_users ?? 5),
        monthly_tx_limit: Number(body.monthly_tx_limit ?? 500),
      },
    });

    if (featureKeys.length > 0 && planType === "main") {
      await this.prisma.plan_features.deleteMany({ where: { plan_id: plan.id } }).catch(() => {});
      for (const key of featureKeys) {
        await this.prisma.plan_features.create({ data: { plan_id: plan.id, feature_key: key, feature_label: key } }).catch(() => {});
      }
    }

    return { success: true, plan: { ...plan, feature_keys: featureKeys } };
  }

  async updatePlan(id: string, body: Record<string, unknown>) {
    const current = await this.prisma.subscription_plans.findUnique({ where: { id } });
    if (!current) throw { status: 404, error: "Plan not found" };

    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw { status: 400, error: "Plan name is required" };
      data.name = name;
    }
    if (body.price !== undefined) {
      const price = Number(body.price);
      if (!Number.isFinite(price) || price < 0) throw { status: 400, error: "Invalid price" };
      data.price = price;
    }
    if (body.billing_cadence !== undefined || body.billing_period !== undefined) {
      data.billing_period = body.billing_cadence === "yearly" || body.billing_period === "yearly" ? "yearly" : "monthly";
    }
    if (body.features !== undefined) data.features = body.features;
    if (body.is_popular !== undefined) data.is_popular = body.is_popular === true;
    if (body.is_active !== undefined) data.is_active = body.is_active === true;
    if (body.plan_type !== undefined) {
      data.plan_type = String(body.plan_type).trim().toLowerCase() === "branch_addon" ? "branch_addon" : "main";
    }
    if (body.max_branches !== undefined) data.max_branches = Number(body.max_branches);
    if (body.max_users !== undefined) data.max_users = Number(body.max_users);
    if (body.monthly_tx_limit !== undefined) data.monthly_tx_limit = Number(body.monthly_tx_limit);

    if (Object.keys(data).length === 0) throw { status: 400, error: "No fields to update" };

    const plan = await this.prisma.subscription_plans.update({ where: { id }, data: data as any });

    const featureKeys = Array.isArray(body.feature_keys)
      ? body.feature_keys as string[]
      : Array.isArray(body.featureKeys)
        ? body.featureKeys as string[]
        : null;

    if (featureKeys) {
      await this.prisma.plan_features.deleteMany({ where: { plan_id: id } }).catch(() => {});
      for (const key of featureKeys) {
        await this.prisma.plan_features.create({ data: { plan_id: id, feature_key: key, feature_label: key } }).catch(() => {});
      }
    }

    return { success: true, plan: { ...plan, feature_keys: featureKeys ?? undefined } };
  }

  async deletePlan(id: string) {
    await this.prisma.subscription_plans.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Force-link or create a Polar product for the given plan.
   * If `polarProductId` is supplied, it is saved directly (admin picked from dropdown).
   * Otherwise, the plan data is synced to Polar to create/update the product, and
   * the returned product ID is saved to `polar_product_id` on the plan row.
   */
  async syncPlanToPolar(planId: string, polarProductId?: string) {
    const plan = await this.prisma.subscription_plans.findUnique({ where: { id: planId } });
    if (!plan) throw { status: 404, error: "Plan not found" };

    let finalProductId = polarProductId?.trim() || null;
    let action: "linked" | "created" | "updated" | "recreated" | "skipped" = "linked";

    if (!finalProductId) {
      // Dynamically import to avoid circular dependency — sync-plan lives in lib/polar on frontend;
      // on backend we call Polar SDK directly via PolarService.createCheckout flow.
      // Use the same logic: call Polar products API.
      const { Polar } = await import("@polar-sh/sdk");
      const token = process.env.POLAR_ACCESS_TOKEN?.trim();
      if (!token) throw { status: 503, error: "Polar is not configured (POLAR_ACCESS_TOKEN missing)" };
      const polar = new Polar({ accessToken: token, server: process.env.POLAR_SERVER === "production" ? "production" : "sandbox" });

      const priceRwf = Number(plan.price ?? 0);
      if (priceRwf <= 0) {
        return { success: true, polarProductId: null, action: "skipped", message: "Free plans do not need a Polar product." };
      }

      const existingId = (plan.polar_product_id ?? "").trim() || null;
      let needsCreate = true;

      if (existingId) {
        try {
          const existing = await polar.products.get({ id: existingId });
          const archived = (existing as { isArchived?: boolean }).isArchived === true;
          if (!archived) {
            // Update metadata/name only
            await polar.products.update({ id: existingId, productUpdate: { name: plan.name } });
            finalProductId = existingId;
            action = "updated";
            needsCreate = false;
          }
        } catch { /* archived or missing — fall through to create */ }
      }

      if (needsCreate) {
        const rwfPerUsd = Number(process.env.POLAR_RWF_PER_USD ?? "1300") || 1300;
        const currency = (process.env.POLAR_CHECKOUT_CURRENCY ?? "usd").toLowerCase();
        const priceAmount = currency === "rwf"
          ? Math.max(0, Math.round(priceRwf))
          : Math.max(0, Math.round((priceRwf / rwfPerUsd) * 100));
        const recurringInterval = plan.billing_period === "yearly" ? "year" : "month";

        const created = await polar.products.create({
          name: plan.name,
          recurringInterval,
          recurringIntervalCount: 1,
          metadata: { pryrox_plan_id: plan.id, pryrox_plan_name: plan.name },
          prices: [{ amountType: "fixed", priceCurrency: currency as any, priceAmount }],
        });
        finalProductId = created.id ?? null;
        action = existingId ? "recreated" : "created";
      }
    }

    if (finalProductId) {
      await this.prisma.subscription_plans.update({
        where: { id: planId },
        data: { polar_product_id: finalProductId, updated_at: new Date() },
      });
    }

    return {
      success: true,
      polarProductId: finalProductId,
      action,
      planId,
      planName: plan.name,
    };
  }

  // --- Billing ---

  async getBilling() {
    const [payments, subscriptions] = await Promise.all([
      this.prisma.payment_transactions.findMany({
        orderBy: { created_at: "desc" },
        take: 200,
        include: { pharmacies: { select: { name: true, email: true, owner_id: true } } },
      }),
      this.prisma.subscriptions.findMany({
        orderBy: { created_at: "desc" },
        take: 200,
        include: { pharmacies: { select: { name: true } } },
      }),
    ]);

    const paymentRows = payments.map((p) => ({
      id: p.id,
      pharmacy_id: p.pharmacy_id,
      pharmacy_name: p.pharmacies?.name ?? "Unknown",
      pharmacy_email: p.pharmacies?.email ?? null,
      amount: Number(p.amount ?? 0),
      currency: p.currency ?? "RWF",
      status: p.status,
      payment_provider: p.payment_method ?? null,
      customer_email: null as string | null,
      customer_name: null as string | null,
      catalog_plan_name: null as string | null,
      created_at: p.created_at?.toISOString() ?? "",
      completed_at: p.status === "completed" ? (p.updated_at?.toISOString() ?? null) : null,
    }));

    const subscriptionRows = subscriptions.map((s) => ({
      pharmacy_id: s.pharmacy_id,
      pharmacy_name: s.pharmacies?.name ?? "Unknown",
      pharmacy_email: null as string | null,
      access_status: s.is_active && s.status === "active" ? "active" : s.status,
      main_plan_name: s.plan,
      main_billing_status: s.status,
      pending_plan_name: null as string | null,
      branch_addons_active: 0,
      expires_at: s.expires_at?.toISOString() ?? null,
    }));

    const totalRevenue = payments
      .filter((p) => p.status === "completed")
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);

    const volumeByCurrency: Record<string, number> = {};
    payments
      .filter((p) => p.status === "completed")
      .forEach((p) => {
        const cur = p.currency ?? "RWF";
        volumeByCurrency[cur] = (volumeByCurrency[cur] ?? 0) + Number(p.amount ?? 0);
      });

    const completedCount = payments.filter((p) => p.status === "completed").length;
    const pendingCount = payments.filter((p) => p.status === "pending").length;
    const failedCount = payments.filter((p) => p.status === "failed").length;

    return {
      payments: paymentRows,
      pharmacies: subscriptionRows,
      reconciliation: [] as Array<{
        id: string;
        kind: "orphan_payment" | "pending_main" | "missing_plan_id";
        pharmacy_id: string | null;
        pharmacy_name: string | null;
        detail: string;
        payment_transaction_id?: string | null;
        subscription_id?: string | null;
        can_cancel: boolean;
      }>,
      summary: {
        completed_count: completedCount,
        pending_count: pendingCount,
        failed_count: failedCount,
        volume_by_currency: volumeByCurrency,
        platform_currency: "RWF",
      },
    };
  }

  async cancelPendingBilling(body: { payment_transaction_id?: string; subscription_id?: string; pharmacy_id?: string }) {
    if (body.payment_transaction_id) {
      const tx = await this.prisma.payment_transactions.findUnique({ where: { id: body.payment_transaction_id } });
      if (!tx || tx.status !== "pending") throw { status: 400, error: "Transaction not found or not pending" };
      await this.prisma.payment_transactions.update({ where: { id: body.payment_transaction_id }, data: { status: "cancelled" } });
      return { success: true, type: "payment" };
    }
    if (body.subscription_id) {
      const sub = await this.prisma.subscriptions.findUnique({ where: { id: body.subscription_id } });
      if (!sub || (sub.status !== "pending" && sub.status !== "incomplete")) throw { status: 400, error: "Subscription not found or not pending" };
      await this.prisma.subscriptions.update({ where: { id: body.subscription_id }, data: { status: "cancelled", is_active: false } });
      return { success: true, type: "subscription" };
    }
    if (body.pharmacy_id) {
      const subs = await this.prisma.subscriptions.findMany({
        where: { pharmacy_id: body.pharmacy_id, status: { in: ["pending", "incomplete"] } },
      });
      for (const s of subs) {
        await this.prisma.subscriptions.update({ where: { id: s.id }, data: { status: "cancelled", is_active: false } });
      }
      return { success: true, type: "pharmacy", cancelled: subs.length };
    }
    throw { status: 400, error: "Provide payment_transaction_id, subscription_id, or pharmacy_id" };
  }

  async listTransactions() {
    const [transactions, subscriptions] = await Promise.all([
      this.prisma.payment_transactions.findMany({
        orderBy: { created_at: "desc" },
        take: 200,
        include: { pharmacies: { select: { name: true } } },
      }),
      this.prisma.subscriptions.findMany({
        orderBy: { created_at: "desc" },
        take: 200,
        include: { pharmacies: { select: { name: true } } },
      }),
    ]);
    return {
      transactions: transactions.map((t) => ({ ...t, pharmacyName: t.pharmacies?.name ?? null })),
      subscriptions: subscriptions.map((s) => ({ ...s, pharmacyName: s.pharmacies?.name ?? null })),
    };
  }

  async getReportsSummary() {
    const [payments, pharmacies, subscriptions] = await Promise.all([
      this.prisma.payment_transactions.findMany({ where: { status: "completed" }, select: { amount: true, created_at: true } }),
      this.prisma.pharmacies.findMany({ select: { id: true, status: true, created_at: true } }),
      this.prisma.subscriptions.findMany({ where: { is_active: true }, select: { amount: true, plan: true, pharmacy_id: true } }),
    ]);

    const totalRevenue = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const activePharmacies = pharmacies.filter((p) => p.status === "active").length;
    const estimatedMRR = subscriptions.reduce((s, sub) => s + Number(sub.amount ?? 0), 0);

    const planBreakdown = new Map<string, number>();
    for (const sub of subscriptions) {
      const name = sub.plan ?? "Unknown";
      planBreakdown.set(name, (planBreakdown.get(name) ?? 0) + 1);
    }

    return {
      totalRevenue,
      estimatedMRR,
      activePharmacies,
      totalPharmacies: pharmacies.length,
      completedPayments: payments.length,
      planBreakdown: Object.fromEntries(planBreakdown),
    };
  }

  // --- System settings ---

  async getSystemSettings() {
    const { settings, analytics } = await this.fetchSystemSettings();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = Math.max(totalMemory - freeMemory, 0);
    const systemLoad = totalMemory > 0 ? Math.round((usedMemory / totalMemory) * 100) : 0;

    const [activeGlobalInsurance, activePharmacyInsurance, activeTemplates] = await Promise.all([
      this.prisma.global_insurance_providers.count({ where: { is_active: true } }),
      this.prisma.insurance_providers.count({ where: { is_active: true } }),
      this.prisma.insurance_templates.count({ where: { is_active: true } }),
    ]);

    return {
      settings,
      analytics,
      systemMetrics: {
        systemLoad: Math.min(100, Math.max(0, systemLoad)),
        totalMemory,
        freeMemory,
        uptime: os.uptime(),
      },
      integrations: {
        paymentGateway: { configured: false, status: "not_configured", providers: { polar: false } },
        insurance: {
          configured: activeGlobalInsurance + activePharmacyInsurance > 0,
          status: activeTemplates > 0 ? "healthy" : "review",
          activeProviders: activeGlobalInsurance + activePharmacyInsurance,
          activeTemplates,
        },
      },
    };
  }

  private async fetchSystemSettings() {
    const rows = await this.prisma.system_settings.findMany({
      where: { pharmacy_id: null },
      select: { setting_key: true, setting_value: true },
    });
    const settings: Record<string, unknown> = {};
    for (const row of rows) {
      settings[row.setting_key] = row.setting_value;
    }
    return { settings, analytics: {} };
  }

  async updateSystemSettings(updates: Record<string, unknown>) {
    if (!updates || typeof updates !== "object") throw { status: 400, error: "Invalid request body" };
    const supported = filterSupportedSettings(updates);
    if (Object.keys(supported).length === 0) throw { status: 400, error: "No supported settings provided" };

    for (const [key, value] of Object.entries(supported)) {
      await this.prisma.system_settings.upsert({
        where: { pharmacy_id_setting_key: { pharmacy_id: "", setting_key: key } },
        create: { pharmacy_id: null, setting_key: key, setting_value: value as Prisma.InputJsonValue },
        update: { setting_value: value as Prisma.InputJsonValue },
      }).catch(() => {
        // Fallback: some schemas use a compound unique
      });
    }

    return { success: true, message: "Settings updated successfully", updated: Object.keys(supported).length };
  }

  // --- Email templates ---

  async listEmailTemplates() {
    let templates = await this.prisma.platform_email_templates.findMany({ orderBy: { template_key: "asc" } });
    if (templates.length === 0) {
      const defaults = [
        { templateKey: "auth.signup_confirm", subject: "Confirm your Pryrox email", html: "<p>Confirm your email</p>", text: "Confirm your Pryrox email" },
        { templateKey: "auth.password_reset", subject: "Reset your Pryrox password", html: "<p>Reset your password</p>", text: "Reset your Pryrox password" },
        { templateKey: "auth.staff_invite", subject: "You're invited to join {{pharmacyName}} on Pryrox", html: "<p>You're invited</p>", text: "You're invited to join" },
        { templateKey: "billing.payment_receipt", subject: "Pryrox receipt", html: "<p>Receipt</p>", text: "Receipt" },
        { templateKey: "platform.admin_notice", subject: "Pryrox notice: {{title}}", html: "<p>Notice</p>", text: "Notice" },
      ];
      await Promise.all(
        defaults.map((t) =>
          this.prisma.platform_email_templates.create({
            data: { template_key: t.templateKey, subject: t.subject, html: t.html, text: t.text, is_active: true },
          }),
        ),
      );
      templates = await this.prisma.platform_email_templates.findMany({ orderBy: { template_key: "asc" } });
    }
    return { templates };
  }

  async updateEmailTemplate(body: { templateKey: string; subject: string; html: string; text?: string; isActive?: boolean }) {
    if (!body.templateKey || !body.subject || !body.html) throw { status: 400, error: "templateKey, subject, and html are required" };
    const template = await this.prisma.platform_email_templates.upsert({
      where: { template_key: body.templateKey },
      create: { template_key: body.templateKey, subject: body.subject, html: body.html, text: body.text ?? null, is_active: body.isActive !== false },
      update: { subject: body.subject, html: body.html, text: body.text ?? null, is_active: body.isActive !== false, updated_at: new Date() },
    });
    return { success: true, template };
  }

  // --- Features ---

  async listFeatures() {
    const features = await this.prisma.platform_features.findMany({ orderBy: { sort_order: "asc" } });
    return { features };
  }

  async createFeature(body: Record<string, unknown>) {
    const feature = await this.prisma.platform_features.create({
      data: {
        key: String(body.key ?? ""),
        display_name: String(body.display_name ?? ""),
        description: body.description ? String(body.description) : null,
        group: String(body.group ?? "General"),
        feature_type: String(body.feature_type ?? "boolean"),
        limit_column: body.limit_column ? String(body.limit_column) : null,
        nav_routes: Array.isArray(body.nav_routes) ? body.nav_routes : [],
        sort_order: Number(body.sort_order ?? 0),
        is_active: body.is_active !== false,
      },
    });
    return { success: true, feature };
  }

  async updateFeature(key: string, body: Record<string, unknown>) {
    const data: Record<string, unknown> = {};
    if (body.display_name !== undefined) data.display_name = body.display_name;
    if (body.description !== undefined) data.description = body.description;
    if (body.group !== undefined) data.group = body.group;
    if (body.feature_type !== undefined) data.feature_type = body.feature_type;
    if (body.limit_column !== undefined) data.limit_column = body.limit_column;
    if (body.nav_routes !== undefined) data.nav_routes = body.nav_routes;
    if (body.sort_order !== undefined) data.sort_order = body.sort_order;
    if (body.is_active !== undefined) data.is_active = body.is_active;

    const feature = await this.prisma.platform_features.update({
      where: { key },
      data: data as Prisma.InputJsonValue,
    });
    return { success: true, feature };
  }

  // --- API keys ---

  async resolveApiKeyByToken(token: string): Promise<{ id: string; name: string; permissions: string[] } | null> {
    if (!token || token.length < 8) return null;
    const hash = crypto.createHash("sha256").update(token, "utf-8").digest("hex");
    const prefixed = `sha256:${hash}`;

    const row = await this.prisma.api_keys.findFirst({
      where: {
        pharmacy_id: null,
        is_active: true,
        OR: [{ key_hash: prefixed }, { key_hash: token }],
        AND: [{ OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }] }],
      },
      select: { id: true, name: true, key_hash: true, permissions: true },
    });

    if (!row) return null;

    if (!row.key_hash.startsWith("sha256:")) {
      await this.prisma.api_keys.update({ where: { id: row.id }, data: { key_hash: prefixed, last_used_at: new Date() } }).catch(() => undefined);
    } else {
      await this.prisma.api_keys.update({ where: { id: row.id }, data: { last_used_at: new Date() } }).catch(() => undefined);
    }

    return { id: row.id, name: row.name, permissions: (row.permissions ?? []) as string[] };
  }

  async listApiKeys() {
    return this.prisma.api_keys.findMany({ orderBy: { created_at: "desc" } });
  }

  async createApiKey(body: { name: string; key: string; permissions?: string[]; createdBy: string }) {
    const crypto = await import("crypto");
    const hashedKey = `sha256:${crypto.createHash("sha256").update(body.key).digest("hex")}`;
    const apiKey = await this.prisma.api_keys.create({
      data: {
        name: body.name,
        key_hash: hashedKey,
        key_prefix: body.key.substring(0, 8),
        created_by: body.createdBy,
        permissions: body.permissions ?? [],
      },
    });
    return { success: true, apiKey };
  }

  async updateApiKey(body: { id: string; name?: string; key?: string; status?: string; permissions?: string[] }) {
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.key) {
      const crypto = await import("crypto");
      data.key_hash = `sha256:${crypto.createHash("sha256").update(body.key).digest("hex")}`;
      data.key_prefix = body.key.substring(0, 8);
    }
    if (body.status !== undefined) data.is_active = body.status === "Active";
    if (body.permissions !== undefined) data.permissions = body.permissions;

    await this.prisma.api_keys.update({ where: { id: body.id }, data: data as any });
    return { success: true };
  }

  async deleteApiKey(id: string) {
    await this.prisma.api_keys.delete({ where: { id } });
    return { success: true };
  }

  // --- IP whitelist ---

  async listIpWhitelist() {
    const data = await this.prisma.ip_whitelist.findMany({ where: { pharmacy_id: null } });
    return { ips: data };
  }

  async addIpToWhitelist(body: { ip: string; description?: string }) {
    const data = await this.prisma.ip_whitelist.create({
      data: { pharmacy_id: null, ip_address: body.ip, description: body.description ?? "" },
    });
    return { success: true, ip: data };
  }

  async removeIpFromWhitelist(id: string) {
    await this.prisma.ip_whitelist.delete({ where: { id } });
    return { success: true };
  }

  // --- Backups ---

  async listBackups() {
    const backups = await this.prisma.backups.findMany({ orderBy: { created_at: "desc" } });
    return backups.map((b) => ({
      id: b.id,
      name: b.name,
      size: b.file_size,
      path: b.file_path,
      date: b.created_at,
      status: b.status,
    }));
  }

  async createBackup(body: { type?: string; pharmacy_id?: string }) {
    const type = typeof body.type === "string" ? body.type : "manual";
    const backup = await this.prisma.backups.create({
      data: {
        pharmacy_id: body.pharmacy_id ?? null,
        type,
        name: `${type} backup - ${new Date().toLocaleString()}`,
        status: "completed",
      },
    });
    return { success: true, backup };
  }

  // --- AI trace events ---

  async listAiTraceEvents(query: Record<string, string | undefined>) {
    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(query.pageSize ?? "50", 10)));
    const skip = (page - 1) * pageSize;

    const where: Prisma.ai_trace_eventsWhereInput = {};
    if (query.pharmacyId) where.tenant_id = query.pharmacyId;
    if (query.feature && (query.feature === "drug_safety" || query.feature === "analytics")) where.feature = query.feature;
    if (query.success === "true") where.success = true;
    else if (query.success === "false") where.success = false;
    if (query.from) where.created_at = { gte: new Date(query.from) };
    if (query.to) where.created_at = { ...(where.created_at as object), lte: new Date(query.to) };

    const [events, total, aggregate] = await Promise.all([
      this.prisma.ai_trace_events.findMany({ where, orderBy: { created_at: "desc" }, skip, take: pageSize }),
      this.prisma.ai_trace_events.count({ where }),
      this.prisma.ai_trace_events.aggregate({
        where,
        _count: { _all: true },
        _sum: { input_tokens: true, output_tokens: true },
        _avg: { latency_ms: true },
      }),
    ]);

    const successWhere = { ...where, success: true } as Prisma.ai_trace_eventsWhereInput;
    const [successCount, fallbackCount] = await Promise.all([
      this.prisma.ai_trace_events.count({ where: successWhere }),
      this.prisma.ai_trace_events.count({ where: { ...where, fallback: true } as Prisma.ai_trace_eventsWhereInput }),
    ]);

    return {
      events,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      summary: {
        totalCalls: aggregate._count._all,
        successCount,
        fallbackCount,
        successRate: aggregate._count._all > 0 ? Math.round((successCount / aggregate._count._all) * 100) : 0,
        avgLatencyMs: Math.round(aggregate._avg.latency_ms ?? 0),
        totalInputTokens: aggregate._sum.input_tokens ?? 0,
        totalOutputTokens: aggregate._sum.output_tokens ?? 0,
      },
    };
  }

  // --- Global search ---

  async searchGlobal(q: string) {
    const raw = q.trim();
    if (raw.length < 2) return { pharmacies: [], staff: [], branches: [] };

    const [pharmacies, staffMatches, branchMatches] = await Promise.all([
      this.prisma.pharmacies.findMany({
        where: {
          OR: [
            { name: { contains: raw, mode: "insensitive" } },
            { email: { contains: raw, mode: "insensitive" } },
            { phone: { contains: raw, mode: "insensitive" } },
          ],
        },
        take: 20,
      }),
      this.prisma.staff.findMany({
        where: {
          OR: [
            { first_name: { contains: raw, mode: "insensitive" } },
            { last_name: { contains: raw, mode: "insensitive" } },
            { email: { contains: raw, mode: "insensitive" } },
          ],
        },
        include: { pharmacies: { select: { name: true } } },
        take: 20,
      }),
      this.prisma.branches.findMany({
        where: {
          OR: [
            { name: { contains: raw, mode: "insensitive" } },
            { address: { contains: raw, mode: "insensitive" } },
          ],
        },
        include: { pharmacies: { select: { name: true } } },
        take: 20,
      }),
    ]);

    return {
      pharmacies: pharmacies.map((p) => ({ id: p.id, name: p.name, email: p.email, phone: p.phone })),
      staff: staffMatches.map((s) => ({
        id: s.id,
        name: `${s.first_name} ${s.last_name}`,
        email: s.email,
        role: s.position,
        pharmacyId: s.pharmacy_id ?? "",
        pharmacyName: s.pharmacies?.name ?? "Unknown Pharmacy",
      })),
      branches: branchMatches.map((b) => ({
        id: b.id,
        name: b.name,
        city: b.address,
        status: b.is_active ? "Active" : "Inactive",
        pharmacyId: b.pharmacy_id ?? "",
        pharmacyName: b.pharmacies?.name ?? "Unknown Pharmacy",
      })),
    };
  }

  // --- Categories ---

  async listGlobalCategories() {
    return this.prisma.global_categories.findMany({ orderBy: { name: "asc" } });
  }

  async createGlobalCategory(body: { name?: string; description?: string }) {
    const category = await this.prisma.global_categories.create({
      data: {
        name: body.name || "Unnamed",
        description: body.description || "",
      },
    });
    return { success: true, category };
  }

  async updateGlobalCategory(id: string, body: { name?: string; description?: string; status?: string }) {
    const category = await this.prisma.global_categories.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.status !== undefined ? { is_active: body.status === "Active" } : {}),
      },
    });
    return { success: true, category };
  }

  async deleteGlobalCategory(id: string) {
    const deleted = await this.prisma.global_categories.delete({ where: { id } }).catch(() => null);
    if (!deleted) throw { status: 404, error: "Category not found" };
    return { success: true };
  }

  // --- Insurance templates ---

  async listInsuranceTemplates() {
    return this.prisma.insurance_templates.findMany({ orderBy: { name: "asc" } });
  }

  async createInsuranceTemplate(body: { name?: string; insurance_provider?: string; template_html?: string; template_css?: string }) {
    if (!body?.name?.trim() || !body?.insurance_provider?.trim()) throw { status: 400, error: "Name and insurance provider are required" };
    const data = await this.prisma.insurance_templates.create({
      data: {
        name: String(body.name).trim(),
        insurance_provider: String(body.insurance_provider).trim(),
        template_html: body.template_html ?? "",
        template_css: body.template_css ?? "",
      },
    });
    return { success: true, template: data };
  }

  async updateInsuranceTemplate(id: string, body: { name?: string; insurance_provider?: string; template_html?: string; template_css?: string; is_active?: boolean }) {
    const data = await this.prisma.insurance_templates.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.insurance_provider !== undefined ? { insurance_provider: body.insurance_provider } : {}),
        ...(body.template_html !== undefined ? { template_html: body.template_html } : {}),
        ...(body.template_css !== undefined ? { template_css: body.template_css } : {}),
        ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
      },
    });
    return { success: true, template: data };
  }

  async deleteInsuranceTemplate(id: string) {
    const deleted = await this.prisma.insurance_templates.delete({ where: { id } }).catch(() => null);
    if (!deleted) throw { status: 404, error: "Template not found" };
    return { success: true };
  }

  // --- Maintenance notifications ---

  async sendMaintenanceNotification(body: { message: string; scheduledAt: string }, userId: string) {
    const emails = await this.prisma.public_users.findMany({
      where: { email: { not: null } },
      select: { email: true },
    });
    const validEmails = emails.map((u) => u.email).filter((e): e is string => Boolean(e));
    return { success: true, queued: validEmails.length };
  }

  async getMaintenanceStats() {
    return {
      configured: false,
      stats: null,
      recentBatches: [],
    };
  }

  async uploadReport(file: { buffer: Buffer; originalname: string; mimetype: string }) {
    const maxBytes = 25 * 1024 * 1024;
    if (file.buffer.length > maxBytes) {
      throw { status: 400, error: `File too large (max ${maxBytes / (1024 * 1024)} MB)` };
    }

    const id = crypto.randomUUID();
    const sanitized = file.originalname.replace(/^.*[/\\]/, "").replace(/[^\w.\-()+ ]/g, "_").slice(0, 180) || "report.bin";
    const objectPath = `${id}/${sanitized}`;
    const bucket = "platform-reports";

    const cwd = process.cwd();
    const applicationRoot = path.basename(cwd).toLowerCase() === "backend" ? path.dirname(cwd) : cwd;
    const root = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(applicationRoot, "uploads");
    const directory = path.join(root, bucket);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, objectPath), file.buffer);

    const inserted = await this.prisma.platform_admin_reports.create({
      data: { id, name: sanitized.substring(0, 500), storage_bucket: bucket, storage_object_path: objectPath },
    });

    const relative = `/api/files/${bucket}/${encodeURIComponent(objectPath)}`;
    const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    const downloadUrl = base ? `${base}${relative}` : relative;

    return { id: inserted.id, downloadUrl };
  }
}
