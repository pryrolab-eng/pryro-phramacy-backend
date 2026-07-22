import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type PharmacyToolContext = { pharmacyId: string; branchId?: string | null };
export type ToolResult = { success: boolean; data?: unknown; error?: string };

@Injectable()
export class AiToolsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Pharmacy tools ──────────────────────────────────────────────────────

  async checkInventory(ctx: PharmacyToolContext, params: { query?: string; lowStock?: boolean; expiringSoon?: boolean }): Promise<ToolResult> {
    try {
      const where: any = { pharmacy_id: ctx.pharmacyId, ...(ctx.branchId ? { branch_id: ctx.branchId } : {}) };
      if (params.query) where.medications = { name: { contains: params.query, mode: "insensitive" } };
      if (params.lowStock) where.quantity_in_stock = { lte: 10 };
      if (params.expiringSoon) {
        const d = new Date(); d.setDate(d.getDate() + 30);
        where.expiry_date = { lte: d };
      }
      const items = await this.prisma.inventory.findMany({ where, include: { medications: true }, take: 20, orderBy: { quantity_in_stock: "asc" } });
      return { success: true, data: items.map((i) => ({ id: i.id, name: i.medications?.name ?? "Unknown", stock: i.quantity_in_stock, expiryDate: i.expiry_date, price: i.selling_price })) };
    } catch (err) { return { success: false, error: String(err) }; }
  }

  async getSalesSummary(ctx: PharmacyToolContext, params: { period: "today" | "week" | "month" | "year" }): Promise<ToolResult> {
    try {
      const now = new Date();
      const starts: Record<string, Date> = {
        today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        week: new Date(now.getTime() - 7 * 86400000),
        month: new Date(now.getFullYear(), now.getMonth(), 1),
        year: new Date(now.getFullYear(), 0, 1),
      };
      const sales = await this.prisma.sales.findMany({
        where: { pharmacy_id: ctx.pharmacyId, ...(ctx.branchId ? { branch_id: ctx.branchId } : {}), created_at: { gte: starts[params.period] } },
        include: { sale_items: true },
      });
      const totalRevenue = sales.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
      const totalItems = sales.reduce((s, r) => s + r.sale_items.reduce((ss, i) => ss + i.quantity, 0), 0);
      return { success: true, data: { period: params.period, totalRevenue, totalTransactions: sales.length, totalItems, averageTransactionValue: sales.length > 0 ? totalRevenue / sales.length : 0 } };
    } catch (err) { return { success: false, error: String(err) }; }
  }

  async lookupPatient(ctx: PharmacyToolContext, params: { query: string }): Promise<ToolResult> {
    try {
      const patients = await this.prisma.customers.findMany({
        where: { pharmacy_id: ctx.pharmacyId, OR: [{ name: { contains: params.query, mode: "insensitive" } }, { phone: { contains: params.query } }] },
        take: 10,
      });
      return { success: true, data: patients.map((p) => ({ id: p.id, name: p.name, phone: p.phone, dateOfBirth: p.date_of_birth })) };
    } catch (err) { return { success: false, error: String(err) }; }
  }

  // ─── Admin tools ─────────────────────────────────────────────────────────

  async getPlatformStats(): Promise<ToolResult> {
    try {
      const [totalPharmacies, activePharmacies, totalUsers, recentSignups, revenue] = await Promise.all([
        this.prisma.pharmacies.count(),
        this.prisma.pharmacies.count({ where: { status: "active" } }),
        this.prisma.staff.count(),
        this.prisma.staff.count({ where: { created_at: { gte: new Date(Date.now() - 7 * 86400000) } } }),
        this.prisma.sales.aggregate({ _sum: { total_amount: true }, where: { created_at: { gte: new Date(Date.now() - 30 * 86400000) } } }),
      ]);
      return { success: true, data: { totalPharmacies, activePharmacies, totalUsers, recentSignups, monthlyRevenue: revenue._sum.total_amount ?? 0 } };
    } catch (err) { return { success: false, error: String(err) }; }
  }

  async listAllPharmacies(params: { status?: string; limit?: number }): Promise<ToolResult> {
    try {
      const pharmacies = await this.prisma.pharmacies.findMany({
        where: params.status ? { status: params.status as any } : undefined,
        take: params.limit ?? 20,
        orderBy: { created_at: "desc" },
        include: { _count: { select: { pharmacy_users: true } } },
      });
      return { success: true, data: pharmacies.map((p) => ({ id: p.id, name: p.name, status: p.status, userCount: p._count.pharmacy_users, createdAt: p.created_at })) };
    } catch (err) { return { success: false, error: String(err) }; }
  }

  async getAiUsageStats(): Promise<ToolResult> {
    try {
      const stats = await this.prisma.ai_trace_events.groupBy({
        by: ["feature", "success"],
        _count: true,
        _sum: { input_tokens: true, output_tokens: true },
        _avg: { latency_ms: true },
      });
      return { success: true, data: stats.map((s) => ({ feature: s.feature, success: s.success, count: s._count, totalInputTokens: s._sum.input_tokens, totalOutputTokens: s._sum.output_tokens, avgLatencyMs: s._avg.latency_ms })) };
    } catch (err) { return { success: false, error: String(err) }; }
  }

  // ─── Tool dispatcher ─────────────────────────────────────────────────────

  async executeTool(name: string, args: Record<string, unknown>, ctx: { pharmacyId?: string; branchId?: string | null; scope: string }): Promise<unknown> {
    const pharmacyCtx: PharmacyToolContext = { pharmacyId: ctx.pharmacyId ?? "", branchId: ctx.branchId };

    switch (name) {
      case "check_inventory": return this.checkInventory(pharmacyCtx, args as any);
      case "get_sales_summary": return this.getSalesSummary(pharmacyCtx, args as any);
      case "lookup_patient": return this.lookupPatient(pharmacyCtx, args as any);
      case "get_platform_stats": return this.getPlatformStats();
      case "list_all_pharmacies": return this.listAllPharmacies(args as any);
      case "get_ai_usage_stats": return this.getAiUsageStats();
      default: return { success: false, error: `Unknown tool: ${name}` };
    }
  }

  getToolDefinitions(scope: "pharmacy" | "platform_admin") {
    const pharmacy = [
      { name: "check_inventory", description: "Check inventory levels. Filter by query, low stock, or expiring soon.", parameters: { type: "object", properties: { query: { type: "string" }, lowStock: { type: "boolean" }, expiringSoon: { type: "boolean" } }, required: [] } },
      { name: "get_sales_summary", description: "Get sales summary for today, week, month, or year.", parameters: { type: "object", properties: { period: { type: "string", enum: ["today", "week", "month", "year"] } }, required: ["period"] } },
      { name: "lookup_patient", description: "Look up patient by name or phone.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
    ];
    const admin = [
      { name: "get_platform_stats", description: "Platform-wide statistics.", parameters: { type: "object", properties: {}, required: [] } },
      { name: "list_all_pharmacies", description: "List all pharmacies.", parameters: { type: "object", properties: { status: { type: "string" }, limit: { type: "number" } }, required: [] } },
      { name: "get_ai_usage_stats", description: "AI usage statistics.", parameters: { type: "object", properties: {}, required: [] } },
    ];
    return (scope === "pharmacy" ? pharmacy : admin).map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: { ...t.parameters, type: "object" } },
    }));
  }
}
