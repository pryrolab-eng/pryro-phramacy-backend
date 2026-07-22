import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { INTEGRATION_V1_PERMISSIONS } from "./dto/v1.dto";
import type { PlatformApiKeyContext } from "./guards/platform-api-key.guard";

const INTEGRATION_V1_DISCOVERY = {
  version: "v1",
  auth: {
    headers: ["X-Pryrox-Api-Key", "Authorization: Bearer <key>"],
    issuedBy: "Pryrox platform admin (Admin → Settings → Integrations)",
    note: "Platform keys for external developers — not per-pharmacy tenant credentials.",
  },
  endpoints: [
    { method: "GET", path: "/api/integrations/v1/health", permission: null, description: "Liveness check; confirms key is valid" },
    { method: "GET", path: "/api/integrations/v1", permission: null, description: "This discovery document" },
    { method: "GET", path: "/api/integrations/v1/pharmacies", permission: "pharmacies.read", description: "List pharmacies (active by default)" },
    { method: "GET", path: "/api/integrations/v1/pharmacies/{id}", permission: "pharmacies.read", description: "Pharmacy profile + branch list" },
    { method: "GET", path: "/api/integrations/v1/inventory", permission: "inventory.read", query: "pharmacyId (required), branchId (optional)", description: "Branch-scoped stock rows" },
    { method: "GET", path: "/api/integrations/v1/sales", permission: "sales.read", query: "pharmacyId (required), from, to, limit", description: "Completed sales with line-item counts" },
    { method: "GET", path: "/api/integrations/v1/webhooks", permission: "webhooks.manage", description: "List webhooks registered by the current API key" },
    { method: "POST", path: "/api/integrations/v1/webhooks", permission: "webhooks.manage", description: "Register an outbound webhook URL and event subscriptions" },
    { method: "DELETE", path: "/api/integrations/v1/webhooks/{id}", permission: "webhooks.manage", description: "Deactivate a webhook owned by the current API key" },
  ],
  webhooks: {
    status: "available",
    direction: "outbound",
    description: "Pryrox POSTs events to partner URLs registered via /api/integrations/v1/webhooks.",
    events: ["sale.completed", "inventory.low_stock", "inventory.expiring_soon"],
  },
};

type IntegrationPharmacySummary = {
  id: string; name: string; email: string | null; phone: string | null;
  city: string | null; province: string | null; status: string | null;
  subscriptionPlan: string | null; createdAt: string | null;
};

type IntegrationPharmacyDetail = IntegrationPharmacySummary & {
  address: string | null; licenseNumber: string | null;
  branches: Array<{ id: string; name: string; address: string | null; phone: string | null; isActive: boolean }>;
};

@Injectable()
export class IntegrationsV1Service {
  constructor(private readonly prisma: PrismaService) {}

  getHealth(key: PlatformApiKeyContext) {
    return { ok: true, service: "pryrox-integrations", version: "v1", keyName: key.name };
  }

  getDiscovery(key: PlatformApiKeyContext) {
    return { ...INTEGRATION_V1_DISCOVERY, key: { name: key.name, permissions: key.permissions } };
  }

  async listPharmacies(includeInactive?: boolean) {
    const rows = await this.prisma.pharmacies.findMany({
      where: includeInactive ? undefined : { status: "active" },
      orderBy: { created_at: "desc" },
      select: {
        id: true, name: true, email: true, phone: true, city: true, province: true,
        status: true, subscription_plan: true, created_at: true,
      },
    });
    return { pharmacies: rows.map(mapPharmacySummary), count: rows.length };
  }

  async getPharmacyDetail(pharmacyId: string): Promise<IntegrationPharmacyDetail | null> {
    const row = await this.prisma.pharmacies.findUnique({
      where: { id: pharmacyId },
      select: {
        id: true, name: true, email: true, phone: true, city: true, province: true,
        address: true, license_number: true, status: true, subscription_plan: true, created_at: true,
        branches: { where: { is_active: true }, orderBy: { created_at: "asc" }, select: { id: true, name: true, address: true, phone: true, is_active: true } },
      },
    });
    if (!row) return null;
    return {
      ...mapPharmacySummary(row),
      address: row.address,
      licenseNumber: row.license_number,
      branches: row.branches.map((b) => ({ id: b.id, name: b.name, address: b.address, phone: b.phone, isActive: b.is_active ?? false })),
    };
  }

  async pharmacyExists(pharmacyId: string): Promise<boolean> {
    const count = await this.prisma.pharmacies.count({ where: { id: pharmacyId } });
    return count > 0;
  }

  async listInventory(pharmacyId: string, branchId?: string) {
    const inventory = await this.prisma.inventory.findMany({
      where: {
        pharmacy_id: pharmacyId,
        ...(branchId ? { branch_id: branchId } : {}),
      },
      select: {
        id: true, medication_id: true, quantity_in_stock: true, selling_price: true,
        batch_number: true, expiry_date: true, minimum_stock_level: true,
        medications: { select: { name: true, category: true } },
      },
    });
    return inventory.map((item) => ({
      id: item.id,
      medicationId: item.medication_id,
      name: item.medications?.name ?? "Unknown",
      category: item.medications?.category ?? "General",
      stock: Number(item.quantity_in_stock ?? 0),
      minStock: Number(item.minimum_stock_level ?? 0),
      price: Number(item.selling_price ?? 0),
      expiryDate: item.expiry_date?.toISOString() ?? null,
      batchNumber: item.batch_number ?? null,
    }));
  }

  async listSales(input: { pharmacyId: string; from?: Date; to?: Date; limit: number }) {
    const sales = await this.prisma.sales.findMany({
      where: {
        pharmacy_id: input.pharmacyId,
        ...(input.from || input.to ? { created_at: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } } : {}),
      },
      orderBy: { created_at: "desc" },
      take: input.limit,
      select: {
        id: true, receipt_number: true, customer_name: true, customer_phone: true,
        total_amount: true, payment_method: true, status: true, branch_id: true, created_at: true,
      },
    });

    const saleIds = sales.map((s) => s.id);
    const counts = saleIds.length > 0
      ? await this.prisma.sale_items.groupBy({ by: ["sale_id"], where: { sale_id: { in: saleIds } }, _count: { _all: true } })
      : [];
    const countBySale = new Map(counts.map((c) => [c.sale_id, c._count._all]));

    return {
      sales: sales.map((sale) => ({
        id: sale.id,
        receiptNumber: sale.receipt_number,
        customerName: sale.customer_name,
        customerPhone: sale.customer_phone,
        totalAmount: Number(sale.total_amount ?? 0),
        paymentMethod: sale.payment_method,
        status: sale.status,
        branchId: sale.branch_id,
        itemCount: countBySale.get(sale.id) ?? 0,
        createdAt: sale.created_at?.toISOString() ?? null,
      })),
    };
  }

  async listWebhooks(apiKeyId: string) {
    const webhooks = await this.prisma.integration_webhooks.findMany({
      where: { api_key_id: apiKeyId },
      orderBy: { created_at: "desc" },
    });
    return { webhooks, count: webhooks.length };
  }

  async createWebhook(apiKeyId: string, url: string, events: string[], secret?: string | null) {
    const webhook = await this.prisma.integration_webhooks.create({
      data: { api_key_id: apiKeyId, url: url.trim(), secret: secret ?? null, events, is_active: true },
    });
    return { webhook };
  }

  async deleteWebhook(webhookId: string, apiKeyId: string) {
    const result = await this.prisma.integration_webhooks.updateMany({
      where: { id: webhookId, api_key_id: apiKeyId },
      data: { is_active: false, updated_at: new Date() },
    });
    return result.count > 0;
  }
}

function mapPharmacySummary(row: {
  id: string; name: string; email: string | null; phone: string | null;
  city: string | null; province: string | null; status: string | null;
  subscription_plan: string | null; created_at: Date | null;
}): IntegrationPharmacySummary {
  return {
    id: row.id, name: row.name, email: row.email, phone: row.phone,
    city: row.city, province: row.province, status: row.status,
    subscriptionPlan: row.subscription_plan,
    createdAt: row.created_at?.toISOString() ?? null,
  };
}
