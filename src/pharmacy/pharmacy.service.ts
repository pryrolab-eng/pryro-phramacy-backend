import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { CustomersService } from "../customers/customers.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { InventoryService } from "../inventory/inventory.service";
import { PrismaService } from "../prisma/prisma.service";
import { ClickhouseService } from "../clickhouse/clickhouse.service";
import {
  DEFAULT_INVOICE_TEMPLATE,
  DEMO_CUSTOMERS,
  DEMO_INSURANCE_PROVIDER,
  DEMO_INVENTORY_PRODUCTS,
  EMPTY_DASHBOARD,
  type AuditLogFilters,
  type InvoiceTemplateConfig,
  type MedicationInsuranceCoverageMap,
} from "./models";

const DAY_MS = 86_400_000;

function decimal(value: { toString(): string } | null | undefined): number {
  return value == null ? 0 : Number(value);
}

function parseBooleanSetting(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return parseBooleanSetting(record.value ?? record.enabled, fallback);
  }
  return fallback;
}

function parseTemplate(value: unknown): InvoiceTemplateConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_INVOICE_TEMPLATE };
  }
  return {
    ...DEFAULT_INVOICE_TEMPLATE,
    ...(value as Partial<InvoiceTemplateConfig>),
  };
}

function parseCoverage(raw: unknown): MedicationInsuranceCoverageMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const output: MedicationInsuranceCoverageMap = {};
  for (const [providerId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    output[providerId] = {
      covered: entry.covered === undefined ? undefined : Boolean(entry.covered),
      externalCode:
        typeof entry.externalCode === "string" ? entry.externalCode : undefined,
      notes: typeof entry.notes === "string" ? entry.notes : undefined,
      effectiveFrom:
        typeof entry.effectiveFrom === "string" ? entry.effectiveFrom : undefined,
      effectiveTo:
        entry.effectiveTo === null || typeof entry.effectiveTo === "string"
          ? (entry.effectiveTo as string | null)
          : undefined,
    };
  }
  return output;
}

function formatAuditSummary(
  action: string,
  tableName: string | null,
  newValues: unknown,
  oldValues: unknown,
): string {
  const labels: Record<string, string> = {
    sales: "Sales",
    sale_items: "Sale items",
    inventory: "Inventory",
    customers: "Customers",
    prescriptions: "Prescriptions",
    subscriptions: "Subscriptions",
    staff: "Staff",
    branches: "Branches",
    insurance_claims: "Insurance claims",
    insurance_providers: "Insurance providers",
    cashier_shifts: "Cashier shifts",
    returns: "Returns",
    medications: "Medications",
    categories: "Categories",
    pharmacy_settings: "Settings",
    platform_settings: "Platform settings",
  };
  const table = tableName
    ? labels[tableName] ?? tableName.replace(/_/g, " ")
    : "Record";
  if (action === "INSERT") return `Created ${table}`;
  if (action === "DELETE") return `Deleted ${table}`;
  if (action === "UPDATE") {
    const values = newValues as Record<string, unknown> | null;
    const name = values?.name ?? values?.customer_name ?? values?.receipt_number;
    return name ? `Updated ${table}: ${String(name)}` : `Updated ${table}`;
  }
  return oldValues || newValues ? `${action} on ${table}` : `${action} ${table}`;
}

@Injectable()
export class PharmacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    private readonly customers: CustomersService,
    private readonly ch: ClickhouseService,
  ) {}

  reportRange(from?: string, to?: string) {
    return from && to
      ? { from, to }
      : {
          from: new Date(Date.now() - 30 * DAY_MS).toISOString(),
          to: new Date().toISOString(),
        };
  }

  private salesWhere(
    pharmacyId: string,
    branchId?: string,
    range?: { from: string; to: string },
  ): Prisma.salesWhereInput {
    return {
      pharmacy_id: pharmacyId,
      ...(branchId ? { branch_id: branchId } : {}),
      ...(range
        ? {
            created_at: {
              gte: new Date(range.from),
              lte: new Date(range.to),
            },
          }
        : {}),
    };
  }

  async dashboardStats(
    pharmacyId: string,
    branchId: string | undefined,
    range: { from: string; to: string },
  ) {
    const today = new Date().toISOString().slice(0, 10);
    const fromDay = range.from.slice(0, 10);
    const toDay = range.to.slice(0, 10);

    // Parallel: ClickHouse for revenue aggregates + Postgres for counts
    const [totalProducts, activeStaff] = await Promise.all([
      this.prisma.medications.count({ where: { pharmacy_id: pharmacyId } }),
      this.prisma.pharmacy_users.count({ where: { pharmacy_id: pharmacyId, is_active: true } }),
    ]);

    // ClickHouse fast path for sales totals
    if (this.ch.isConfigured()) {
      try {
        const [todayRevenue, rangeResult] = await Promise.all([
          this.ch.getTodayRevenue(pharmacyId, branchId),
          this.ch.getSalesSummary(pharmacyId, fromDay, toDay, branchId),
        ]);
        return {
          totalProducts,
          lowStockItems: 0,
          todaySales: todayRevenue,
          monthlyRevenue: rangeResult.totalRevenue,
          totalCustomers: 0,
          activeStaff,
          pendingOrders: rangeResult.totalOrders,
          expiringProducts: 0,
          branchId: branchId ?? null,
          source: "clickhouse",
        };
      } catch { /* fallback */ }
    }

    // Postgres fallback — use aggregate instead of findMany
    const [todayAgg, rangeAgg] = await Promise.all([
      this.prisma.sales.aggregate({
        where: {
          pharmacy_id: pharmacyId,
          ...(branchId ? { branch_id: branchId } : {}),
          created_at: { gte: new Date(`${today}T00:00:00.000Z`) },
        },
        _sum: { total_amount: true },
        _count: { id: true },
      }),
      this.prisma.sales.aggregate({
        where: this.salesWhere(pharmacyId, branchId, range),
        _sum: { total_amount: true },
        _count: { id: true },
      }),
    ]);
    return {
      totalProducts,
      lowStockItems: 0,
      todaySales: Math.round(decimal(todayAgg._sum.total_amount)),
      monthlyRevenue: Math.round(decimal(rangeAgg._sum.total_amount)),
      totalCustomers: 0,
      activeStaff,
      pendingOrders: rangeAgg._count.id,
      expiringProducts: 0,
      branchId: branchId ?? null,
    };
  }

  async salesChart(pharmacyId: string, branchId?: string) {
    const sixMonthsAgo = new Date(Date.now() - 6 * 30 * DAY_MS).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    if (this.ch.isConfigured()) {
      try {
        const summary = await this.ch.getSalesSummary(pharmacyId, sixMonthsAgo, today, branchId);
        const totals: Record<string, number> = {};
        for (const row of summary.dailySales) {
          const month = months[new Date(row.day).getMonth()]!;
          totals[month] = (totals[month] ?? 0) + row.revenue;
        }
        return Object.entries(totals).map(([month, revenue]) => ({ month, revenue: Math.round(revenue) }));
      } catch { /* fallback */ }
    }

    const rows = await this.prisma.sales.findMany({
      where: {
        pharmacy_id: pharmacyId,
        ...(branchId ? { branch_id: branchId } : {}),
        created_at: { gte: new Date(Date.now() - 6 * 30 * DAY_MS) },
      },
      select: { total_amount: true, created_at: true },
    });
    const totals: Record<string, number> = {};
    for (const row of rows) {
      const month = months[new Date(row.created_at ?? new Date()).getMonth()]!;
      totals[month] = (totals[month] ?? 0) + decimal(row.total_amount);
    }
    return Object.entries(totals).map(([month, revenue]) => ({ month, revenue: Math.round(revenue) }));
  }

  async inventoryChart(pharmacyId: string) {
    const rows = await this.prisma.inventory.findMany({
      where: { pharmacy_id: pharmacyId, medications: { pharmacy_id: pharmacyId } },
      select: {
        quantity_in_stock: true,
        minimum_stock_level: true,
        created_at: true,
        updated_at: true,
      },
    });
    const now = new Date();
    const months: string[] = [];
    for (let index = 5; index >= 0; index -= 1) {
      months.push(
        new Date(now.getFullYear(), now.getMonth() - index, 1).toLocaleString(
          "en-US",
          { month: "short" },
        ),
      );
    }
    const totals: Record<string, { inStock: number; lowStock: number }> = {};
    for (const row of rows) {
      const month = new Date(row.updated_at ?? row.created_at ?? new Date()).toLocaleString(
        "en-US",
        { month: "short" },
      );
      totals[month] ??= { inStock: 0, lowStock: 0 };
      if ((row.quantity_in_stock ?? 0) <= (row.minimum_stock_level ?? 0)) {
        totals[month].lowStock += 1;
      } else {
        totals[month].inStock += 1;
      }
    }
    return months.map((month) => ({
      month,
      inStock: totals[month]?.inStock ?? 0,
      lowStock: totals[month]?.lowStock ?? 0,
    }));
  }

  async categorySales(pharmacyId: string, branchId?: string) {
    const today = new Date().toISOString().slice(0, 10);
    const from30 = new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10);

    if (this.ch.isConfigured()) {
      try {
        const rows = await this.ch.getCategoryRevenue(pharmacyId, from30, today);
        return rows.map((r) => ({ category: r.category, sales: r.revenue, fill: `var(--color-${r.category})` }));
      } catch { /* fallback */ }
    }

    const rows = await this.prisma.sale_items.findMany({
      where: { sales: { pharmacy_id: pharmacyId, ...(branchId ? { branch_id: branchId } : {}) } },
      select: { total_price: true, inventory: { select: { medications: { select: { category: true } } } } },
    });
    const totals: Record<string, number> = {};
    for (const row of rows) {
      const category = row.inventory?.medications?.category ?? "other";
      totals[category] = (totals[category] ?? 0) + decimal(row.total_price);
    }
    return Object.entries(totals).map(([category, sales]) => ({
      category, sales: Math.round(sales), fill: `var(--color-${category})`,
    }));
  }

  async weeklySales(pharmacyId: string, branchId?: string) {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    // ClickHouse has aggregated category data but not day-of-week breakdown
    // Use Postgres for the 7-day window — it's small and fast
    const rows = await this.prisma.sale_items.findMany({
      where: {
        sales: {
          pharmacy_id: pharmacyId,
          ...(branchId ? { branch_id: branchId } : {}),
          created_at: { gte: new Date(Date.now() - 7 * DAY_MS) },
        },
      },
      select: {
        total_price: true,
        sales: { select: { created_at: true } },
        inventory: { select: { medications: { select: { category: true } } } },
      },
    });
    const totals: Record<string, { prescription: number; otc: number }> = {};
    for (const row of rows) {
      if (!row.sales?.created_at) continue;
      const dayIndex = row.sales.created_at.getDay();
      const day = days[dayIndex === 0 ? 6 : dayIndex - 1]!;
      totals[day] ??= { prescription: 0, otc: 0 };
      const key = row.inventory?.medications?.category === "prescription" ? "prescription" : "otc";
      totals[day][key] += decimal(row.total_price);
    }
    return days.map((day) => ({
      day,
      prescription: Math.round(totals[day]?.prescription ?? 0),
      otc: Math.round(totals[day]?.otc ?? 0),
    }));
  }

  async combinedDashboard(
    pharmacyId: string,
    branchId: string | undefined,
    range: { from: string; to: string },
  ) {
    const [stats, recentRows, alerts, salesChart, weeklySales, categorySales, inventoryChart] =
      await Promise.all([
        this.dashboardStats(pharmacyId, branchId, range),
        this.prisma.sales.findMany({
          where: {
            pharmacy_id: pharmacyId,
            ...(branchId ? { branch_id: branchId } : {}),
          },
          orderBy: { created_at: "desc" },
          take: 5,
          select: {
            id: true,
            customer_name: true,
            total_amount: true,
            payment_method: true,
            created_at: true,
            sale_items: { select: { id: true } },
          },
        }),
        this.inventory.stockAlerts(pharmacyId, branchId),
        this.salesChart(pharmacyId, branchId),
        this.weeklySales(pharmacyId, branchId),
        this.categorySales(pharmacyId, branchId),
        this.inventoryChart(pharmacyId),
      ]);
    const mapAlert = (item: (typeof alerts.all)[number]) => {
      const expiry = item.expiry ? new Date(item.expiry) : null;
      return {
        id: item.id,
        product: item.name,
        current_stock: item.quantity ?? 0,
        min_stock: item.minimum ?? 0,
        category: item.category,
        expires_in:
          expiry && !Number.isNaN(expiry.getTime())
            ? Math.ceil((expiry.getTime() - Date.now()) / DAY_MS)
            : 0,
      };
    };
    return {
      stats,
      recentSales: recentRows.map((row) => ({
        id: row.id,
        customer: row.customer_name || "Walk-in Customer",
        amount: decimal(row.total_amount),
        items: row.sale_items.length || 1,
        time: row.created_at
          ? row.created_at.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "",
        payment_method:
          row.payment_method === "mobile_money"
            ? "Mobile Money"
            : row.payment_method === "cash"
              ? "Cash"
              : row.payment_method === "insurance"
                ? "Insurance"
                : "Card",
      })),
      stockAlerts: {
        all: alerts.all.map(mapAlert),
        lowStock: alerts.lowStock.map(mapAlert),
        expiring: alerts.expiring.map(mapAlert),
      },
      salesChart,
      weeklySales,
      categorySales,
      inventoryChart,
    };
  }

  emptyCombinedDashboard() {
    return EMPTY_DASHBOARD;
  }

  async settings(pharmacyId: string) {
    const [pharmacy, localeRows, entitlements] = await Promise.all([
      this.prisma.pharmacies.findUnique({
        where: { id: pharmacyId },
        select: {
          name: true,
          license_number: true,
          city: true,
          province: true,
          phone: true,
          email: true,
          subscription_plan: true,
          subscription_expires_at: true,
        },
      }),
      this.prisma.pharmacy_settings.findMany({
        where: {
          pharmacy_id: pharmacyId,
          setting_key: { in: ["currency", "language"] },
        },
        select: { setting_key: true, setting_value: true },
      }),
      this.entitlements.resolvePharmacyEntitlements(pharmacyId),
    ]);
    if (!pharmacy) return null;
    const settings = new Map(localeRows.map((row) => [row.setting_key, row.setting_value]));
    const settingString = (key: string, fallback: string) => {
      const value = settings.get(key);
      return typeof value === "string" && value.trim() ? value.trim() : fallback;
    };
    return {
      name: pharmacy.name,
      license: pharmacy.license_number,
      location: [pharmacy.city, pharmacy.province].filter(Boolean).join(", "),
      phone: pharmacy.phone,
      email: pharmacy.email,
      subscription:
        entitlements.effectivePlan?.name.toLowerCase() ||
        entitlements.effectivePlanLabel ||
        String(pharmacy.subscription_plan || "standard").toLowerCase(),
      subscriptionExpiresAt: pharmacy.subscription_expires_at ?? null,
      currency: settingString("currency", "RWF"),
      language: settingString("language", "en"),
    };
  }

  async isOwner(userId: string, pharmacyId: string) {
    const membership = await this.prisma.pharmacy_users.findFirst({
      where: { user_id: userId, pharmacy_id: pharmacyId },
      select: { role: true },
    });
    return Boolean(
      membership &&
        ["pharmacy_owner", "admin", "superadmin"].includes(String(membership.role)),
    );
  }

  async updateSettings(
    pharmacyId: string,
    userId: string,
    body: Record<string, unknown>,
    metadata: { ipAddress?: string; userAgent?: string },
  ) {
    const parts = String(body.location ?? "")
      .split(",")
      .map((part) => part.trim());
    const pharmacy = await this.prisma.pharmacies.update({
      where: { id: pharmacyId },
      data: {
        name: String(body.name),
        phone: String(body.phone),
        email: String(body.email),
        city: parts[0] || null,
        province: parts[1] || null,
      },
    });
    const localeEntries = [
      ["currency", body.currency],
      ["language", body.language],
    ] as const;
    await Promise.all(
      localeEntries
        .filter((entry) => Boolean(entry[1]))
        .map(([settingKey, value]) => {
          const settingValue = value as Prisma.InputJsonValue;
          return (
          this.prisma.pharmacy_settings.upsert({
            where: {
              pharmacy_id_setting_key: {
                pharmacy_id: pharmacyId,
                setting_key: settingKey,
              },
            },
            create: {
              pharmacy_id: pharmacyId,
              setting_key: settingKey,
              setting_value: settingValue,
            },
            update: { setting_value: settingValue, updated_at: new Date() },
          })
          );
        }),
    );
    await this.audit.writeAuditLog({
      pharmacyId,
      userId,
      action: "UPDATE",
      tableName: "pharmacies",
      recordId: pharmacyId,
      newValues: {
        pharmacy,
        locale: { currency: body.currency, language: body.language },
      },
      ...metadata,
    });
  }

  async invoiceTemplate(pharmacyId: string) {
    const row = await this.prisma.pharmacy_settings.findUnique({
      where: {
        pharmacy_id_setting_key: {
          pharmacy_id: pharmacyId,
          setting_key: "invoice_template",
        },
      },
      select: { setting_value: true },
    });
    return parseTemplate(row?.setting_value);
  }

  async saveInvoiceTemplate(
    pharmacyId: string,
    body: Record<string, unknown>,
  ) {
    const row = await this.prisma.pharmacy_settings.upsert({
      where: {
        pharmacy_id_setting_key: {
          pharmacy_id: pharmacyId,
          setting_key: "invoice_template",
        },
      },
      create: {
        pharmacy_id: pharmacyId,
        setting_key: "invoice_template",
        setting_value: body as Prisma.InputJsonValue,
      },
      update: {
        setting_value: body as Prisma.InputJsonValue,
        updated_at: new Date(),
      },
      select: { setting_value: true },
    });
    return parseTemplate(row.setting_value);
  }

  async platformFlag(key: string, fallback = true) {
    const row = await this.prisma.system_settings.findFirst({
      where: { pharmacy_id: null, setting_key: key },
      select: { setting_value: true },
    });
    return parseBooleanSetting(row?.setting_value, fallback);
  }

  private auditWhere(
    pharmacyId: string,
    filters: AuditLogFilters,
  ): Prisma.audit_logsWhereInput {
    const where: Prisma.audit_logsWhereInput = { pharmacy_id: pharmacyId };
    if (filters.action && filters.action !== "all") where.action = filters.action;
    if (filters.table && filters.table !== "all") where.table_name = filters.table;
    if (filters.userId && filters.userId !== "all") {
      where.user_id = filters.userId === "system" ? null : filters.userId;
    }
    if (filters.from || filters.to) {
      where.created_at = {};
      if (filters.from) {
        const from = new Date(filters.from);
        if (!Number.isNaN(from.getTime())) where.created_at.gte = from;
      }
      if (filters.to) {
        const to = new Date(filters.to);
        if (!Number.isNaN(to.getTime())) {
          to.setHours(23, 59, 59, 999);
          where.created_at.lte = to;
        }
      }
    }
    const query = filters.search?.trim();
    if (query) {
      where.OR = [
        { table_name: { contains: query, mode: "insensitive" } },
        { action: { contains: query, mode: "insensitive" } },
        ...(query.match(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        )
          ? [{ record_id: query }]
          : []),
      ];
    }
    return where;
  }

  async activityLogs(input: {
    pharmacyId: string;
    limit: number;
    offset: number;
    filters: AuditLogFilters;
    includeFacets: boolean;
  }) {
    const where = this.auditWhere(input.pharmacyId, input.filters);
    const [logs, total, groups, tableRows, actionRows, userRows] =
      await Promise.all([
        this.prisma.audit_logs.findMany({
          where,
          orderBy: { created_at: "desc" },
          skip: input.offset,
          take: input.limit,
        }),
        this.prisma.audit_logs.count({ where }),
        this.prisma.audit_logs.groupBy({
          by: ["action"],
          where,
          _count: { _all: true },
        }),
        input.includeFacets
          ? this.prisma.audit_logs.findMany({
              where: { pharmacy_id: input.pharmacyId, table_name: { not: null } },
              distinct: ["table_name"],
              select: { table_name: true },
              orderBy: { table_name: "asc" },
            })
          : Promise.resolve([]),
        input.includeFacets
          ? this.prisma.audit_logs.findMany({
              where: { pharmacy_id: input.pharmacyId },
              distinct: ["action"],
              select: { action: true },
              orderBy: { action: "asc" },
            })
          : Promise.resolve([]),
        input.includeFacets
          ? this.prisma.audit_logs.findMany({
              where: { pharmacy_id: input.pharmacyId, user_id: { not: null } },
              distinct: ["user_id"],
              select: { user_id: true },
            })
          : Promise.resolve([]),
      ]);
    const userIds = Array.from(
      new Set([
        ...logs.map((row) => row.user_id).filter((id): id is string => Boolean(id)),
        ...userRows
          .map((row) => row.user_id)
          .filter((id): id is string => Boolean(id)),
      ]),
    );
    const profiles = await this.prisma.public_users.findMany({
      where: { id: { in: userIds } },
      select: { id: true, full_name: true, name: true, email: true },
    });
    const labels = Object.fromEntries(
      profiles.map((profile) => [
        profile.id,
        profile.full_name ||
          profile.name ||
          profile.email?.split("@")[0] ||
          "User",
      ]),
    );
    const byAction = Object.fromEntries(
      groups.map((row) => [row.action, row._count._all]),
    );
    return {
      items: logs.map((log) => ({
        id: log.id,
        action: log.action,
        tableName: log.table_name,
        recordId: log.record_id,
        userId: log.user_id,
        userLabel: log.user_id ? labels[log.user_id] ?? "User" : "System",
        createdAt: log.created_at?.toISOString() ?? null,
        summary: formatAuditSummary(
          log.action,
          log.table_name,
          log.new_values,
          log.old_values,
        ),
      })),
      total,
      limit: input.limit,
      offset: input.offset,
      stats: {
        total,
        inserts: byAction.INSERT ?? 0,
        updates: byAction.UPDATE ?? 0,
        deletes: byAction.DELETE ?? 0,
      },
      facets: input.includeFacets
        ? {
            tables: tableRows
              .map((row) => row.table_name)
              .filter((name): name is string => Boolean(name)),
            actions: actionRows.map((row) => row.action),
            users: [
              { id: "system", label: "System" },
              ...userIds.map((id) => ({ id, label: labels[id] ?? "User" })),
            ],
          }
        : undefined,
    };
  }

  private async resolveProvider(pharmacyId: string, providerIdOrName: string) {
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const select = {
      id: true,
      name: true,
      coverage_percentage: true,
      default_coverage_percent: true,
    } as const;
    if (uuid.test(providerIdOrName)) {
      return this.prisma.insurance_providers.findUnique({
        where: { id: providerIdOrName, is_active: true },
        select,
      });
    }
    return (
      (await this.prisma.insurance_providers.findFirst({
        where: {
          pharmacy_id: pharmacyId,
          is_active: true,
          name: { equals: providerIdOrName, mode: "insensitive" },
        },
        select,
      })) ??
      this.prisma.insurance_providers.findFirst({
        where: {
          pharmacy_id: null,
          is_active: true,
          name: { equals: providerIdOrName, mode: "insensitive" },
        },
        select,
      })
    );
  }

  async medicationCoverage(input: {
    pharmacyId: string;
    medicationId?: string;
    providerId?: string;
    search?: string;
  }) {
    if (input.medicationId) {
      const medication = await this.prisma.medications.findFirst({
        where: { pharmacy_id: input.pharmacyId, id: input.medicationId },
        select: { id: true, name: true, insurance_coverage: true },
      });
      if (!medication) return null;
      const providers = await this.prisma.insurance_providers.findMany({
        where: {
          is_active: true,
          OR: [{ pharmacy_id: input.pharmacyId }, { pharmacy_id: null }],
        },
        orderBy: { name: "asc" },
      });
      const coverage = parseCoverage(medication.insurance_coverage);
      return {
        medication: { id: medication.id, name: medication.name },
        providers: providers.map((provider) => ({
          id: provider.id,
          name: provider.name,
          coveragePercent: Number(
            provider.default_coverage_percent ??
              provider.coverage_percentage ??
              0,
          ),
          covered: coverage[provider.id]?.covered === true,
          externalCode: coverage[provider.id]?.externalCode ?? null,
        })),
      };
    }
    const provider = input.providerId
      ? await this.resolveProvider(input.pharmacyId, input.providerId)
      : null;
    if (!provider) return null;
    const medications = await this.prisma.medications.findMany({
      where: {
        pharmacy_id: input.pharmacyId,
        is_active: true,
        ...(input.search?.trim()
          ? { name: { contains: input.search.trim(), mode: "insensitive" } }
          : {}),
      },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, category: true, insurance_coverage: true },
    });
    return {
      provider: {
        id: provider.id,
        name: provider.name,
        coveragePercent: Number(
          provider.default_coverage_percent ?? provider.coverage_percentage ?? 0,
        ),
      },
      medications: medications.map((medication) => {
        const entry = parseCoverage(medication.insurance_coverage)[provider.id];
        return {
          id: medication.id,
          name: medication.name,
          category: medication.category,
          covered: entry?.covered === true,
          externalCode: entry?.externalCode ?? null,
          notes: entry?.notes ?? null,
          effectiveFrom: entry?.effectiveFrom ?? null,
          effectiveTo: entry?.effectiveTo ?? null,
        };
      }),
    };
  }

  async updateMedicationCoverage(
    pharmacyId: string,
    body: Record<string, unknown>,
  ) {
    const medicationId = String(body.medicationId ?? "").trim();
    const providerId = String(body.providerId ?? body.provider ?? "").trim();
    const medication = await this.prisma.medications.findFirst({
      where: { pharmacy_id: pharmacyId, id: medicationId },
      select: { id: true, insurance_coverage: true },
    });
    if (!medication) return { kind: "medication" as const };
    const provider = await this.resolveProvider(pharmacyId, providerId);
    if (!provider) return { kind: "provider" as const };
    const coverage = parseCoverage(medication.insurance_coverage);
    coverage[provider.id] = {
      ...(coverage[provider.id] ?? {}),
      covered: Boolean(body.covered),
      externalCode:
        body.externalCode === undefined || body.externalCode === null
          ? undefined
          : String(body.externalCode).trim() || undefined,
      notes:
        body.notes === undefined || body.notes === null
          ? undefined
          : String(body.notes).trim() || undefined,
      effectiveFrom:
        body.effectiveFrom === undefined || body.effectiveFrom === null
          ? undefined
          : String(body.effectiveFrom).trim() || undefined,
      effectiveTo:
        body.effectiveTo === undefined
          ? undefined
          : body.effectiveTo === null
            ? null
            : String(body.effectiveTo).trim() || null,
    };
    await this.prisma.medications.update({
      where: { id: medicationId },
      data: {
        insurance_coverage: coverage as Prisma.InputJsonValue,
        updated_at: new Date(),
      },
    });
    const entry = coverage[provider.id];
    return {
      kind: "ok" as const,
      response: {
        success: true,
        medicationId,
        providerId: provider.id,
        covered: entry?.covered === true,
        externalCode: entry?.externalCode ?? null,
        notes: entry?.notes ?? null,
      },
    };
  }

  async legacyDashboard(pharmacyId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS);

    const [todaySales, recentSales, lowStockItems, totalProducts, activeStaff] =
      await Promise.all([
        this.prisma.sales.findMany({
          where: { pharmacy_id: pharmacyId, created_at: { gte: today } },
          select: { total_amount: true },
        }),
        this.prisma.sales.findMany({
          where: { pharmacy_id: pharmacyId },
          orderBy: { created_at: "desc" },
          take: 5,
          select: {
            id: true,
            customer_name: true,
            total_amount: true,
            payment_method: true,
            created_at: true,
          },
        }),
        this.prisma.inventory.count({
          where: {
            pharmacy_id: pharmacyId,
            quantity_in_stock: { lte: 10 },
          },
        }),
        this.prisma.medications.count({ where: { pharmacy_id: pharmacyId } }),
        this.prisma.pharmacy_users.count({
          where: { pharmacy_id: pharmacyId, is_active: true },
        }),
      ]);

    const todayTotal = todaySales.reduce(
      (sum, row) => sum + decimal(row.total_amount),
      0,
    );

    return {
      stats: {
        todaySales: Math.round(todayTotal),
        totalProducts,
        lowStockItems,
        activeStaff,
      },
      alerts: lowStockItems > 0 ? [{ type: "low_stock", count: lowStockItems }] : [],
      recentSales: recentSales.map((row) => ({
        id: row.id,
        customer: row.customer_name || "Walk-in Customer",
        amount: decimal(row.total_amount),
        paymentMethod: row.payment_method,
        date: row.created_at?.toISOString() ?? null,
      })),
    };
  }

  async seedDemo(pharmacyId: string) {
    const branch = await this.prisma.branches.findFirst({
      where: {
        pharmacy_id: pharmacyId,
        is_active: { not: false },
        OR: [{ is_headquarters: true }, { is_main_branch: true }],
      },
      orderBy: { created_at: "asc" },
      select: { id: true },
    });
    const fallback =
      branch ??
      (await this.prisma.branches.findFirst({
        where: { pharmacy_id: pharmacyId, is_active: { not: false } },
        orderBy: { created_at: "asc" },
        select: { id: true },
      }));
    if (!fallback) {
      throw new Error("Pharmacy has no branch — complete onboarding first");
    }
    let inventoryCreated = 0;
    let inventorySkipped = 0;
    for (const [name, category, stock, minStock, price, expiryDate, batchNumber] of
      DEMO_INVENTORY_PRODUCTS) {
      const exists = await this.prisma.medications.findFirst({
        where: {
          pharmacy_id: pharmacyId,
          name: { equals: name, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (exists) {
        inventorySkipped += 1;
        continue;
      }
      await this.inventory.addMedication(
        {
          name,
          category,
          quantity: stock,
          batch_number: batchNumber,
          unit_cost: Math.round(price * 0.7),
          selling_price: price,
          minimum_stock_level: minStock,
          expiry_date: expiryDate,
        },
        pharmacyId,
        fallback.id,
      );
      inventoryCreated += 1;
    }
    let customersCreated = 0;
    let customersSkipped = 0;
    for (const [name, phone, email, dateOfBirth, allergies, insuranceNumber] of
      DEMO_CUSTOMERS) {
      const exists = await this.prisma.customers.findFirst({
        where: {
          pharmacy_id: pharmacyId,
          phone: { equals: phone, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (exists) {
        customersSkipped += 1;
        continue;
      }
      await this.customers.create({
        pharmacyId,
        name,
        phone,
        email,
        dateOfBirth,
        allergies: allergies
          ? allergies.split(/[,;]/).map((value) => value.trim()).filter(Boolean)
          : [],
        insuranceNumber,
      });
      customersCreated += 1;
    }
    let provider = await this.prisma.insurance_providers.findFirst({
      where: {
        pharmacy_id: pharmacyId,
        name: { equals: DEMO_INSURANCE_PROVIDER.name, mode: "insensitive" },
      },
      select: { id: true, name: true },
    });
    const providerCreated = !provider;
    if (!provider) {
      provider = await this.prisma.insurance_providers.create({
        data: {
          pharmacy_id: pharmacyId,
          name: DEMO_INSURANCE_PROVIDER.name,
          coverage_percentage: DEMO_INSURANCE_PROVIDER.coveragePercentage,
          default_coverage_percent: DEMO_INSURANCE_PROVIDER.coveragePercentage,
          contact_email: DEMO_INSURANCE_PROVIDER.contactEmail,
          contact_phone: DEMO_INSURANCE_PROVIDER.contactPhone,
          policy_number: DEMO_INSURANCE_PROVIDER.policyNumber,
          is_active: true,
        },
        select: { id: true, name: true },
      });
    }
    return {
      pharmacyId,
      branchId: fallback.id,
      inventory: { created: inventoryCreated, skipped: inventorySkipped },
      customers: { created: customersCreated, skipped: customersSkipped },
      insuranceProvider: {
        created: providerCreated,
        id: provider.id,
        name: provider.name,
      },
    };
  }
}
