import { HttpException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  TenantContextService,
  type ActivePharmacyContext,
} from "./tenant-context.service";

/** Capability keys — keep in sync with pharmacy_role_permissions seed migration. */
export const PHARMACY_PERMISSIONS = {
  workspaceHome: "workspace.home",
  clinicalDashboard: "clinical.dashboard",
  prescriptionsAccess: "prescriptions.access",
  inventoryAccess: "inventory.access",
  posAccess: "pos.access",
  salesView: "sales.view",
  customersAccess: "customers.access",
  patientsAccess: "patients.access",
  reportsView: "reports.view",
  settingsSelf: "settings.self",
  settingsPharmacy: "settings.pharmacy",
  staffManage: "staff.manage",
  branchesManage: "branches.manage",
  billingSelfServe: "billing.self_serve",
} as const;

export type PharmacyPermission =
  (typeof PHARMACY_PERMISSIONS)[keyof typeof PHARMACY_PERMISSIONS];

/**
 * Maps to the Next.js `permissionErrorResponse` envelope:
 * `{ success: false, error, code: "forbidden" }` with status 403.
 */
export class PharmacyPermissionError extends HttpException {
  constructor(message = "You do not have permission to perform this action") {
    super({ success: false, error: message, code: "forbidden" }, 403);
    this.name = "PharmacyPermissionError";
  }
}

const FALLBACK_PERMISSIONS: Record<string, PharmacyPermission[]> = {
  pharmacy_owner: Object.values(PHARMACY_PERMISSIONS),
  pharmacist: [
    PHARMACY_PERMISSIONS.workspaceHome,
    PHARMACY_PERMISSIONS.clinicalDashboard,
    PHARMACY_PERMISSIONS.prescriptionsAccess,
    PHARMACY_PERMISSIONS.inventoryAccess,
    PHARMACY_PERMISSIONS.posAccess,
    PHARMACY_PERMISSIONS.settingsSelf,
  ],
  cashier: [
    PHARMACY_PERMISSIONS.workspaceHome,
    PHARMACY_PERMISSIONS.posAccess,
    PHARMACY_PERMISSIONS.salesView,
    PHARMACY_PERMISSIONS.customersAccess,
    PHARMACY_PERMISSIONS.settingsSelf,
  ],
  staff: [
    PHARMACY_PERMISSIONS.workspaceHome,
    PHARMACY_PERMISSIONS.posAccess,
    PHARMACY_PERMISSIONS.salesView,
    PHARMACY_PERMISSIONS.customersAccess,
    PHARMACY_PERMISSIONS.settingsSelf,
  ],
};

const CACHE_TTL_MS = 60_000;

@Injectable()
export class PharmacyPermissionService {
  private permissionsCache: Map<string, PharmacyPermission[]> | null = null;
  private cacheLoadedAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async loadRolePermissions(
    role: string | null | undefined,
  ): Promise<PharmacyPermission[]> {
    const key = role ?? "staff";
    const now = Date.now();
    if (this.permissionsCache && now - this.cacheLoadedAt < CACHE_TTL_MS) {
      return this.permissionsCache.get(key) ?? FALLBACK_PERMISSIONS.staff;
    }

    const rows = await this.prisma.pharmacy_role_permissions.findMany({
      select: { role: true, permission: true },
    });

    if (!rows.length) {
      return FALLBACK_PERMISSIONS[key] ?? FALLBACK_PERMISSIONS.staff;
    }

    const map = new Map<string, PharmacyPermission[]>();
    for (const row of rows) {
      const r = String(row.role);
      const list = map.get(r) ?? [];
      list.push(row.permission as PharmacyPermission);
      map.set(r, list);
    }
    this.permissionsCache = map;
    this.cacheLoadedAt = now;
    return map.get(key) ?? FALLBACK_PERMISSIONS[key] ?? FALLBACK_PERMISSIONS.staff;
  }

  hasPermission(
    permissions: readonly string[] | null | undefined,
    permission: string,
  ): boolean {
    return (permissions ?? []).includes(permission);
  }

  async requirePharmacyPermission(
    userId: string,
    permission: PharmacyPermission,
  ): Promise<{ ctx: ActivePharmacyContext; permissions: PharmacyPermission[] }> {
    const ctx = await this.tenant.resolveActiveContext(userId);
    if (!ctx.activePharmacyId) {
      throw new PharmacyPermissionError("Pharmacy not found");
    }
    const permissions = await this.loadRolePermissions(ctx.role);
    if (!this.hasPermission(permissions, permission)) {
      throw new PharmacyPermissionError();
    }
    return { ctx, permissions };
  }
}
