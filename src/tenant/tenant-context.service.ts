import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type ActivePharmacyContext = {
  activePharmacyId: string | null;
  activeBranchId: string | null;
  role: string | null;
  memberships: Array<{
    id: string;
    pharmacy_id: string | null;
    role: string;
    pharmacy_name: string | null;
  }>;
};

const UNRESTRICTED_ROLES = new Set(["pharmacy_owner", "admin"]);

@Injectable()
export class TenantContextService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllowedBranchIds(
    userId: string,
    pharmacyId: string,
    role: string | null,
  ): Promise<string[] | null> {
    if (role && UNRESTRICTED_ROLES.has(role)) return null;
    const membership = await this.prisma.pharmacy_users.findFirst({
      where: { user_id: userId, pharmacy_id: pharmacyId, is_active: true },
      select: { id: true },
    });
    if (!membership) return [];
    const rows = await this.prisma.staff_branch_assignments.findMany({
      where: { pharmacy_user_id: membership.id },
      select: { branch_id: true },
    });
    return rows.length ? rows.map((row) => row.branch_id) : null;
  }

  private async pickBranch(
    pharmacyId: string,
    allowedIds: string[] | null,
    preferredId: string | null,
  ): Promise<string | null> {
    if (allowedIds?.length === 0) return null;
    const branches = await this.prisma.branches.findMany({
      where: {
        pharmacy_id: pharmacyId,
        is_active: { not: false },
        ...(allowedIds ? { id: { in: allowedIds } } : {}),
      },
      orderBy: [{ is_headquarters: "desc" }, { created_at: "asc" }],
      select: { id: true, is_headquarters: true },
    });
    if (preferredId && branches.some((branch) => branch.id === preferredId)) {
      return preferredId;
    }
    return branches.find((branch) => branch.is_headquarters)?.id ?? branches[0]?.id ?? null;
  }

  async resolveActiveContext(userId: string): Promise<ActivePharmacyContext> {
    const [rows, user] = await Promise.all([
      this.prisma.pharmacy_users.findMany({
        where: { user_id: userId, is_active: true },
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          pharmacy_id: true,
          role: true,
          pharmacies: { select: { name: true } },
        },
      }),
      this.prisma.public_users.findUnique({
        where: { id: userId },
        select: { active_pharmacy_id: true, active_branch_id: true },
      }),
    ]);
    const memberships = rows.map((row) => ({
      id: row.id,
      pharmacy_id: row.pharmacy_id,
      role: String(row.role),
      pharmacy_name: row.pharmacies?.name ?? null,
    }));
    if (!memberships.length) {
      return { activePharmacyId: null, activeBranchId: null, role: null, memberships };
    }

    const pharmacyIds = new Set(memberships.map((row) => row.pharmacy_id));
    let activePharmacyId =
      user?.active_pharmacy_id && pharmacyIds.has(user.active_pharmacy_id)
        ? user.active_pharmacy_id
        : memberships.find((row) => row.role === "pharmacy_owner")?.pharmacy_id ??
          memberships[0]?.pharmacy_id ??
          null;
    let activeBranchId = user?.active_branch_id ?? null;
    const role =
      memberships.find((row) => row.pharmacy_id === activePharmacyId)?.role ?? null;

    if (activePharmacyId) {
      const allowed = await this.getAllowedBranchIds(userId, activePharmacyId, role);
      activeBranchId = await this.pickBranch(
        activePharmacyId,
        allowed,
        activeBranchId,
      );
      if (
        user?.active_pharmacy_id !== activePharmacyId ||
        user.active_branch_id !== activeBranchId
      ) {
        await this.persist(userId, activePharmacyId, activeBranchId);
      }
    }
    return { activePharmacyId, activeBranchId, role, memberships };
  }

  async resolvePharmacyId(userId: string): Promise<string | null> {
    return (await this.resolveActiveContext(userId)).activePharmacyId;
  }

  async requirePharmacyId(userId: string): Promise<string> {
    const id = await this.resolvePharmacyId(userId);
    if (!id) throw new Error("Pharmacy not found");
    return id;
  }

  async requireBranchId(userId: string): Promise<string> {
    const ctx = await this.resolveActiveContext(userId);
    if (!ctx.activeBranchId) {
      throw new Error(
        "No active branch. Ask an owner to assign you a location, or select one in the top bar.",
      );
    }
    return ctx.activeBranchId;
  }

  async resolveRequestBranchScope(
    userId: string,
    requestedBranchId?: string | null,
  ): Promise<{
    pharmacyId: string;
    branchId: string | null;
    allowedBranchIds: string[] | null;
  }> {
    const ctx = await this.resolveActiveContext(userId);
    if (!ctx.activePharmacyId) {
      throw new Error("Pharmacy not found for this account");
    }
    const allowed = await this.getAllowedBranchIds(
      userId,
      ctx.activePharmacyId,
      ctx.role,
    );
    if (requestedBranchId && requestedBranchId !== "all") {
      if (allowed && !allowed.includes(requestedBranchId)) {
        throw new Error("You do not have access to this branch");
      }
      return {
        pharmacyId: ctx.activePharmacyId,
        branchId: requestedBranchId,
        allowedBranchIds: allowed,
      };
    }
    if (allowed && allowed.length === 1) {
      return {
        pharmacyId: ctx.activePharmacyId,
        branchId: allowed[0] ?? ctx.activeBranchId,
        allowedBranchIds: allowed,
      };
    }
    return {
      pharmacyId: ctx.activePharmacyId,
      branchId: allowed ? ctx.activeBranchId : null,
      allowedBranchIds: allowed,
    };
  }

  async setActivePharmacy(
    userId: string,
    pharmacyId: string,
  ): Promise<ActivePharmacyContext> {
    const membership = await this.prisma.pharmacy_users.findFirst({
      where: { user_id: userId, pharmacy_id: pharmacyId, is_active: true },
      select: { role: true },
    });
    if (!membership) {
      throw new ForbiddenException({ error: "You do not have access to this pharmacy" });
    }
    const role = String(membership.role);
    const allowed = await this.getAllowedBranchIds(userId, pharmacyId, role);
    let headquartersId: string | null = null;
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ ensure_pharmacy_hq_branch: string | null }>
      >`SELECT ensure_pharmacy_hq_branch(${pharmacyId}::uuid) AS ensure_pharmacy_hq_branch`;
      headquartersId = rows[0]?.ensure_pharmacy_hq_branch ?? null;
    } catch (error) {
      console.error("ensureHeadquartersBranch rpc:", error);
    }
    const branchId = await this.pickBranch(
      pharmacyId,
      allowed,
      headquartersId,
    );
    await this.persist(userId, pharmacyId, branchId);
    return this.resolveActiveContext(userId);
  }

  async setActiveBranch(
    userId: string,
    branchId: string,
  ): Promise<ActivePharmacyContext> {
    const context = await this.resolveActiveContext(userId);
    if (!context.activePharmacyId) throw new Error("No active pharmacy");
    const branch = await this.prisma.branches.findFirst({
      where: {
        id: branchId,
        pharmacy_id: context.activePharmacyId,
        is_active: { not: false },
      },
      select: { id: true },
    });
    if (!branch) {
      throw new ForbiddenException({ error: "Invalid branch for the active pharmacy" });
    }
    const allowed = await this.getAllowedBranchIds(
      userId,
      context.activePharmacyId,
      context.role,
    );
    if (allowed && !allowed.includes(branchId)) {
      throw new ForbiddenException({ error: "You do not have access to this branch" });
    }
    await this.persist(userId, context.activePharmacyId, branchId);
    return this.resolveActiveContext(userId);
  }

  private async persist(
    userId: string,
    pharmacyId: string | null,
    branchId: string | null,
  ): Promise<void> {
    await this.prisma.public_users.update({
      where: { id: userId },
      data: {
        active_pharmacy_id: pharmacyId,
        active_branch_id: branchId,
        updated_at: new Date(),
      },
    });
  }
}
