import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(userId: string) {
    const membership = await this.prisma.pharmacy_users.findFirst({
      where: { user_id: userId, is_active: true },
      orderBy: { created_at: "desc" },
      select: { pharmacy_id: true, role: true },
    });

    const isPlatformAdmin = await this.prisma.public_users
      .findUnique({ where: { id: userId }, select: { is_platform_admin: true } })
      .then((r) => r?.is_platform_admin === true);

    if (isPlatformAdmin || membership?.role === "admin") {
      return { step: 1, pharmacy: null, pendingPlan: null, completed: false, isPlatformAdmin: true, redirect: "/admin" };
    }

    let pharmacyId = membership?.pharmacy_id ?? null;

    if (!pharmacyId) {
      const owned = await this.prisma.pharmacies.findFirst({
        where: { owner_id: userId },
        select: { id: true },
      });
      if (owned?.id) {
        await this.ensureMembership(owned.id, userId, "pharmacy_owner");
        pharmacyId = owned.id;
      }
    }

    if (!pharmacyId) {
      return { step: 1, pharmacy: null, pendingPlan: null, completed: false, needsPharmacyProfile: true };
    }

    const pharmacy = await this.prisma.pharmacies.findUnique({
      where: { id: pharmacyId },
      select: { id: true, name: true, city: true, phone: true, email: true, status: true, created_at: true },
    });

    if (!pharmacy) {
      return { step: 1, pharmacy: null, pendingPlan: null, completed: false, needsPharmacyProfile: true };
    }

    const subscription = await this.prisma.subscriptions.findFirst({
      where: { pharmacy_id: pharmacyId, is_active: true },
      orderBy: { created_at: "desc" },
      select: { id: true, status: true },
    });

    if (subscription && subscription.status === "active") {
      return { step: 4, pharmacy, pendingPlan: null, completed: false, subscriptionActive: true };
    }

    const latestSub = await this.prisma.subscriptions.findFirst({
      where: { pharmacy_id: pharmacyId },
      orderBy: { created_at: "desc" },
      select: { id: true, status: true, plan_id: true },
    });

    if (latestSub?.plan_id) {
      const plan = await this.prisma.subscription_plans.findUnique({
        where: { id: latestSub.plan_id },
        select: { id: true, name: true, price: true, period: true, features: true, is_popular: true },
      });
      if (plan && Number(plan.price) > 0 && latestSub.status !== "active") {
        return {
          step: 3, pharmacy, pendingPlan: { id: plan.id, name: plan.name, price: plan.price, period: plan.period, features: plan.features, is_popular: plan.is_popular, subscriptionId: latestSub.id }, completed: false,
        };
      }
    }

    return { step: 2, pharmacy, pendingPlan: null, completed: false };
  }

  async createPharmacy(userId: string, input: { name: string; licenseNumber: string; city: string; address?: string | null; phone: string; email: string }) {
    const existing = await this.prisma.pharmacy_users.findFirst({
      where: { user_id: userId, is_active: true },
      select: { pharmacy_id: true },
    });
    if (existing?.pharmacy_id) {
      return { success: true, pharmacyId: existing.pharmacy_id, alreadyExists: true };
    }

    const max = await this.prisma.system_settings.findFirst({
      where: { pharmacy_id: null, setting_key: "maxPharmacies" },
      select: { setting_value: true },
    });
    const maxVal = Number(max?.setting_value ?? 100);
    if (maxVal <= 0) {
      throw { status: 403, error: "New pharmacies cannot be created at this time.", code: "max_pharmacies_reached" };
    }
    const count = await this.prisma.pharmacies.count();
    if (count >= maxVal) {
      throw { status: 403, error: `Platform pharmacy limit reached (${maxVal}). Contact support to increase capacity.`, code: "max_pharmacies_reached" };
    }

    const pharmacy = await this.prisma.pharmacies.create({
      data: {
        name: input.name.trim(),
        owner_id: userId,
        phone: input.phone,
        email: input.email,
        city: input.city,
        address: input.address ?? null,
        license_number: input.licenseNumber,
        status: "active",
      },
    });

    await this.prisma.pharmacy_users.create({
      data: { pharmacy_id: pharmacy.id, user_id: userId, role: "pharmacy_owner" as never, is_active: true },
    });

    await this.prisma.public_users.update({
      where: { id: userId },
      data: { active_pharmacy_id: pharmacy.id },
    });

    return { success: true, pharmacyId: pharmacy.id };
  }

  private async ensureMembership(pharmacyId: string, userId: string, role: string) {
    const existing = await this.prisma.pharmacy_users.findFirst({
      where: { pharmacy_id: pharmacyId, user_id: userId },
    });
    if (existing) return;
    await this.prisma.pharmacy_users.create({
      data: { pharmacy_id: pharmacyId, user_id: userId, role: role as never, is_active: true },
    });
  }
}
