import { HttpException, Injectable } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";

const PERMISSIONS = {
  prescriptions: "prescriptions.access",
  sales: "sales.view",
  pos: "pos.access",
};
const FALLBACK: Record<string, string[]> = {
  pharmacy_owner: [
    "workspace.home",
    "clinical.dashboard",
    "prescriptions.access",
    "inventory.access",
    "pos.access",
    "sales.view",
    "customers.access",
    "patients.access",
    "reports.view",
    "settings.self",
    "settings.pharmacy",
    "staff.manage",
    "branches.manage",
    "billing.self_serve",
  ],
  pharmacist: [
    "workspace.home",
    "clinical.dashboard",
    "prescriptions.access",
    "inventory.access",
    "pos.access",
    "settings.self",
  ],
  cashier: [
    "workspace.home",
    "pos.access",
    "sales.view",
    "customers.access",
    "settings.self",
  ],
  staff: [
    "workspace.home",
    "pos.access",
    "sales.view",
    "customers.access",
    "settings.self",
  ],
};

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async permissions(role: string | null): Promise<string[]> {
    const rows = await this.prisma.pharmacy_role_permissions.findMany({
      where: { role: role ?? "staff" },
      select: { permission: true },
    });
    return rows.length
      ? rows.map((row) => row.permission)
      : FALLBACK[role ?? "staff"] ?? FALLBACK.staff;
  }

  async context(user: AuthUser) {
    const [ctx, profile, auth] = await Promise.all([
      this.tenant.resolveActiveContext(user.id),
      this.prisma.public_users.findUnique({ where: { id: user.id } }),
      this.prisma.auth_users.findUnique({
        where: { id: user.id },
        select: { raw_user_meta_data: true },
      }),
    ]);
    const [allowedBranchIds, permissions] = ctx.activePharmacyId
      ? await Promise.all([
          this.tenant.getAllowedBranchIds(
            user.id,
            ctx.activePharmacyId,
            ctx.role,
          ),
          this.permissions(ctx.role),
        ])
      : [null, []];
    const metadata =
      auth?.raw_user_meta_data &&
      typeof auth.raw_user_meta_data === "object" &&
      !Array.isArray(auth.raw_user_meta_data)
        ? (auth.raw_user_meta_data as Record<string, unknown>)
        : {};
    return {
      user: {
        id: user.id,
        email: user.email ?? profile?.email ?? null,
        fullName: profile?.full_name ?? null,
        isPlatformAdmin: profile?.is_platform_admin === true,
      },
      activePharmacyId: ctx.activePharmacyId,
      activeBranchId: ctx.activeBranchId,
      role: ctx.role,
      allowedBranchIds,
      permissions,
      mustChangePassword: metadata.must_change_password === true,
      memberships: ctx.memberships
        .filter(
          (membership): membership is typeof membership & { pharmacy_id: string } =>
            Boolean(membership.pharmacy_id),
        )
        .map((membership) => ({
          pharmacyId: membership.pharmacy_id,
          pharmacyName: membership.pharmacy_name,
          role: membership.role,
          isActive: membership.pharmacy_id === ctx.activePharmacyId,
        })),
    };
  }

  async workplace(userId: string) {
    const ctx = await this.tenant.resolveActiveContext(userId);
    if (!ctx.activePharmacyId) {
      throw new HttpException({ error: "No active pharmacy" }, 404);
    }
    const [pharmacy, allowedBranchIds, branches] = await Promise.all([
      this.prisma.pharmacies.findUnique({
        where: { id: ctx.activePharmacyId },
        select: {
          id: true,
          name: true,
          license_number: true,
          city: true,
          province: true,
          phone: true,
          email: true,
        },
      }),
      this.tenant.getAllowedBranchIds(userId, ctx.activePharmacyId, ctx.role),
      this.prisma.branches.findMany({
        where: { pharmacy_id: ctx.activePharmacyId, is_active: true },
        select: { id: true, name: true, address: true, created_at: true },
        orderBy: { created_at: "asc" },
      }),
    ]);
    const mainId = branches[0]?.id ?? null;
    const visible =
      allowedBranchIds === null
        ? branches
        : branches.filter((branch) => allowedBranchIds.includes(branch.id));
    const active = branches.find((branch) => branch.id === ctx.activeBranchId);
    return {
      pharmacy: pharmacy
        ? {
            id: pharmacy.id,
            name: pharmacy.name,
            licenseNumber: pharmacy.license_number,
            location: [pharmacy.city, pharmacy.province].filter(Boolean).join(", "),
            phone: pharmacy.phone,
            businessEmail: pharmacy.email,
          }
        : null,
      membership: { role: ctx.role, roleLabel: this.roleLabel(ctx.role) },
      branchAccess: {
        unrestricted: allowedBranchIds === null,
        allowedBranchIds,
        branches: visible.map((branch) => ({
          id: branch.id,
          name: branch.name,
          city: branch.address,
          isMain: branch.id === mainId,
        })),
        activeBranch: active
          ? { id: active.id, name: active.name, isMain: active.id === mainId }
          : null,
      },
    };
  }

  async dashboard(userId: string) {
    const ctx = await this.tenant.resolveActiveContext(userId);
    if (!ctx.activePharmacyId) {
      throw new HttpException({ error: "No active pharmacy" }, 404);
    }
    const permissions = await this.permissions(ctx.role);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const metrics: Array<{
      key: string;
      label: string;
      value: number | string;
      hint?: string;
    }> = [];
    if (permissions.includes(PERMISSIONS.prescriptions)) {
      const [pending, count] = await Promise.all([
        this.prisma.prescriptions.count({
          where: { pharmacy_id: ctx.activePharmacyId, status: "pending" },
        }),
        this.prisma.prescriptions.count({
          where: { pharmacy_id: ctx.activePharmacyId, created_at: { gte: today } },
        }),
      ]);
      metrics.push(
        {
          key: "pending_prescriptions",
          label: "Pending prescriptions",
          value: pending,
          hint: "Awaiting processing",
        },
        { key: "prescriptions_today", label: "Prescriptions today", value: count },
      );
    }
    if (permissions.includes(PERMISSIONS.sales)) {
      const sales = await this.prisma.sales.findMany({
        where: { pharmacy_id: ctx.activePharmacyId, created_at: { gte: today } },
        select: { total_amount: true },
      });
      metrics.push(
        {
          key: "sales_today_total",
          label: "Sales today",
          value: Math.round(
            sales.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0),
          ),
          hint: "RWF",
        },
        {
          key: "sales_today_count",
          label: "Transactions today",
          value: sales.length,
        },
      );
    }
    if (permissions.includes(PERMISSIONS.pos)) {
      metrics.push({
        key: "pos_ready",
        label: "Point of sale",
        value: "Ready",
        hint: "Open POS to serve customers",
      });
    }
    return { role: ctx.role, metrics };
  }

  private roleLabel(role: string | null): string {
    const labels: Record<string, string> = {
      pharmacy_owner: "Owner",
      pharmacist: "Pharmacist",
      cashier: "Cashier",
      staff: "Staff",
      admin: "Administrator",
      superadmin: "Administrator",
    };
    return role ? labels[role] ?? role.charAt(0).toUpperCase() + role.slice(1) : "Member";
  }
}
