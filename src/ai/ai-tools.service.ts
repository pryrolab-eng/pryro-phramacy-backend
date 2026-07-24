import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";

export type PharmacyToolContext = { pharmacyId: string; branchId?: string | null; userId?: string };
export type ToolResult = { success: boolean; data?: unknown; error?: string };

@Injectable()
export class AiToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

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

  async getSubscriberStats(): Promise<ToolResult> {
    try {
      const [total, byStatus, byPlan] = await Promise.all([
        this.prisma.subscriptions.count(),
        this.prisma.subscriptions.groupBy({ by: ["status"], _count: { id: true } }),
        this.prisma.subscriptions.groupBy({ by: ["plan"], where: { is_active: true, status: "active" }, _count: { id: true } }),
      ]);
      const statusBreakdown = Object.fromEntries(byStatus.map((s) => [s.status, s._count.id]));
      const planBreakdown = Object.fromEntries(byPlan.map((s) => [s.plan ?? "unknown", s._count.id]));
      return { success: true, data: { totalSubscriptions: total, byStatus: statusBreakdown, activeByPlan: planBreakdown } };
    } catch (err) { return { success: false, error: String(err) }; }
  }

  async getRevenueStats(): Promise<ToolResult> {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
      const [totalRevenue, recentRevenue, paymentCount, completedCount, recentTransactions, currencies] = await Promise.all([
        this.prisma.payment_transactions.aggregate({ _sum: { amount: true }, where: { status: "completed" } }),
        this.prisma.payment_transactions.aggregate({ _sum: { amount: true }, where: { status: "completed", created_at: { gte: thirtyDaysAgo } } }),
        this.prisma.payment_transactions.count(),
        this.prisma.payment_transactions.count({ where: { status: "completed" } }),
        this.prisma.payment_transactions.findMany({ where: { status: "completed", created_at: { gte: thirtyDaysAgo } }, select: { amount: true, currency: true, created_at: true, payment_details: true }, orderBy: { created_at: "desc" }, take: 5 }),
        this.prisma.payment_transactions.groupBy({ by: ["currency"], where: { status: "completed" }, _sum: { amount: true }, _count: true }),
      ]);
      const currencyBreakdown = currencies.map(c => ({ currency: c.currency, totalAmount: Number(c._sum.amount ?? 0), count: c._count }));
      const primaryCurrency = currencyBreakdown.length > 0 ? currencyBreakdown.reduce((a, b) => a.totalAmount > b.totalAmount ? a : b).currency : "RWF";
      return { success: true, data: { totalRevenue: Number(totalRevenue._sum.amount ?? 0), last30DaysRevenue: Number(recentRevenue._sum.amount ?? 0), currency: primaryCurrency, currencyBreakdown, totalPayments: paymentCount, completedPayments: completedCount, recentTransactions } };
    } catch (err) { return { success: false, error: String(err) }; }
  }

  async getPharmacyDetails(params: { pharmacyId?: string; name?: string }): Promise<ToolResult> {
    try {
      const where: any = {};
      if (params.pharmacyId) where.id = params.pharmacyId;
      else if (params.name) where.name = { contains: params.name, mode: "insensitive" };
      else return { success: false, error: "Provide pharmacyId or name" };

      const pharmacy = await this.prisma.pharmacies.findFirst({
        where,
        include: {
          pharmacy_users: { select: { user_id: true, role: true, is_active: true } },
          subscriptions: { where: { is_active: true }, select: { plan: true, status: true, expires_at: true, billing_period: true } },
        },
      });
      if (!pharmacy) return { success: false, error: "Pharmacy not found" };
      return { success: true, data: { id: pharmacy.id, name: pharmacy.name, status: pharmacy.status, email: pharmacy.email, phone: pharmacy.phone, subscriptionPlan: pharmacy.subscription_plan, staffCount: pharmacy.pharmacy_users.length, activeStaff: pharmacy.pharmacy_users.filter((u) => u.is_active).length, subscriptions: pharmacy.subscriptions, createdAt: pharmacy.created_at } };
    } catch (err) { return { success: false, error: String(err) }; }
  }

  async getSubscriptionOverview(): Promise<ToolResult> {
    try {
      const [totalPharmacies, activePharmacies, byPlan, expiringSoon] = await Promise.all([
        this.prisma.pharmacies.count(),
        this.prisma.pharmacies.count({ where: { status: "active" } }),
        this.prisma.pharmacies.groupBy({ by: ["subscription_plan"], where: { status: "active" }, _count: { id: true } }),
        this.prisma.subscriptions.findMany({ where: { is_active: true, status: "active", expires_at: { not: null, lte: new Date(Date.now() + 7 * 86400000) } }, select: { pharmacy_id: true, plan: true, expires_at: true }, orderBy: { expires_at: "asc" }, take: 10 }),
      ]);
      const planDistribution = Object.fromEntries(byPlan.map((p) => [p.subscription_plan ?? "none", p._count.id]));
      return { success: true, data: { totalPharmacies, activePharmacies, planDistribution, expiringSoon: expiringSoon.map((s) => ({ pharmacyId: s.pharmacy_id, plan: s.plan, expiresAt: s.expires_at })) } };
    } catch (err) { return { success: false, error: String(err) }; }
  }

  async getRecentActivity(params: { days?: number }): Promise<ToolResult> {
    try {
      const since = new Date(Date.now() - (params.days ?? 30) * 86400000);
      const [recentPharmacies, recentPayments, recentSubscriptions] = await Promise.all([
        this.prisma.pharmacies.findMany({ where: { created_at: { gte: since } }, select: { id: true, name: true, status: true, subscription_plan: true, created_at: true }, orderBy: { created_at: "desc" }, take: 10 }),
        this.prisma.payment_transactions.findMany({ where: { created_at: { gte: since } }, select: { id: true, amount: true, currency: true, status: true, created_at: true }, orderBy: { created_at: "desc" }, take: 10 }),
        this.prisma.subscriptions.findMany({ where: { created_at: { gte: since } }, select: { id: true, plan: true, status: true, created_at: true }, orderBy: { created_at: "desc" }, take: 10 }),
      ]);
      return { success: true, data: { recentPharmacies, recentPayments, recentSubscriptions } };
    } catch (err) { return { success: false, error: String(err) }; }
  }

  async getPlanDetails(params: { planName?: string; planId?: string }): Promise<ToolResult> {
    try {
      const where: any = { is_active: true };
      if (params.planId) where.id = params.planId;
      else if (params.planName) where.name = { contains: params.planName, mode: "insensitive" };

      const plans = await this.prisma.subscription_plans.findMany({
        where,
        include: { plan_features: { select: { feature_key: true, feature_label: true, is_enabled: true, enabled: true } } },
        orderBy: { sort_order: "asc" },
      });
      if (plans.length === 0) return { success: false, error: "No plans found" };
      return { success: true, data: plans.map(p => ({
        id: p.id, name: p.name, description: p.description, price: Number(p.price), yearlyPrice: p.yearly_price ? Number(p.yearly_price) : null,
        period: p.period, billingPeriod: p.billing_period, trialDays: p.trial_days, maxUsers: p.max_users, maxBranches: p.max_branches,
        monthlyTxLimit: p.monthly_tx_limit, planType: p.plan_type, isPopular: p.is_popular, sortOrder: p.sort_order,
        features: p.plan_features.map(f => ({ key: f.feature_key, label: f.feature_label, enabled: f.is_enabled && f.enabled })),
      }))};
    } catch (err) { return { success: false, error: String(err) }; }
  }

  async comparePlans(): Promise<ToolResult> {
    try {
      const plans = await this.prisma.subscription_plans.findMany({
        where: { is_active: true },
        include: { plan_features: { select: { feature_key: true, feature_label: true, is_enabled: true, enabled: true } } },
        orderBy: { sort_order: "asc" },
      });
      const allFeatureKeys = [...new Set(plans.flatMap(p => p.plan_features.map(f => f.feature_key)))];
      const comparison = plans.map(p => ({
        name: p.name, price: Number(p.price), yearlyPrice: p.yearly_price ? Number(p.yearly_price) : null,
        billingPeriod: p.billing_period, trialDays: p.trial_days, maxUsers: p.max_users, maxBranches: p.max_branches,
        monthlyTxLimit: p.monthly_tx_limit,
        features: Object.fromEntries(allFeatureKeys.map(key => {
          const f = p.plan_features.find(pf => pf.feature_key === key);
          return [key, f ? (f.is_enabled && f.enabled) : false];
        })),
      }));
      return { success: true, data: { allFeatureKeys, plans: comparison } };
    } catch (err) { return { success: false, error: String(err) }; }
  }

  // ─── Settings mutation tools ─────────────────────────────────────────────

  async updateUserProfile(userId: string | undefined, params: { fullName?: string; name?: string }): Promise<ToolResult> {
    try {
      if (!userId) return { success: false, error: "User identity context missing" };
      const newName = (params.fullName ?? params.name)?.trim();
      if (!newName) return { success: false, error: "Name parameter is required" };

      await this.prisma.public_users.update({
        where: { id: userId },
        data: { name: newName, full_name: newName, updated_at: new Date() },
      });

      const parts = newName.split(" ");
      const firstName = parts[0] ?? newName;
      const lastName = parts.slice(1).join(" ") || "";

      await this.prisma.staff.updateMany({
        where: { user_id: userId },
        data: { first_name: firstName, last_name: lastName, updated_at: new Date() },
      });

      return { success: true, data: { message: `User profile display name updated to "${newName}".` } };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async updatePharmacySettings(ctx: PharmacyToolContext, params: { name?: string; email?: string; phone?: string; address?: string }): Promise<ToolResult> {
    try {
      if (!ctx.pharmacyId) return { success: false, error: "No active pharmacy context found" };
      const data: any = { updated_at: new Date() };
      if (params.name?.trim()) data.name = params.name.trim();
      if (params.email?.trim()) data.email = params.email.trim();
      if (params.phone?.trim()) data.phone = params.phone.trim();
      if (params.address?.trim()) data.address = params.address.trim();

      const updated = await this.prisma.pharmacies.update({
        where: { id: ctx.pharmacyId },
        data,
      });

      return {
        success: true,
        data: {
          message: "Pharmacy settings updated successfully.",
          pharmacy: { id: updated.id, name: updated.name, email: updated.email, phone: updated.phone, address: updated.address },
        },
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async updatePlatformSettings(params: { maintenanceActive?: boolean; enableRegistrations?: boolean; ipWhitelistEnabled?: boolean }): Promise<ToolResult> {
    try {
      const updates: Array<{ key: string; value: any }> = [];
      if (params.maintenanceActive !== undefined) {
        updates.push({ key: "maintenance_active", value: params.maintenanceActive });
      }
      if (params.enableRegistrations !== undefined) {
        updates.push({ key: "enable_registrations", value: params.enableRegistrations });
      }
      if (params.ipWhitelistEnabled !== undefined) {
        updates.push({ key: "ip_whitelist_enabled", value: params.ipWhitelistEnabled });
      }

      if (updates.length === 0) {
        return { success: false, error: "No platform settings were provided to update" };
      }

      for (const item of updates) {
        const existing = await this.prisma.system_settings.findFirst({
          where: { pharmacy_id: null, setting_key: item.key },
        });

        if (existing) {
          await this.prisma.system_settings.update({
            where: { id: existing.id },
            data: { setting_value: item.value, updated_at: new Date() },
          });
        } else {
          await this.prisma.system_settings.create({
            data: { pharmacy_id: null, setting_key: item.key, setting_value: item.value },
          });
        }
      }

      return {
        success: true,
        data: {
          message: "Platform system settings updated successfully.",
          updatedSettings: params,
        },
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  // ─── Email template & sending tools ──────────────────────────────────────

  async listEmailTemplates(): Promise<ToolResult> {
    try {
      let templates = await this.prisma.platform_email_templates.findMany({ orderBy: { template_key: "asc" } });
      if (templates.length === 0) {
        const defaults = [
          { template_key: "auth.signup_confirm", subject: "Confirm your Pryrox email", html: "<p>Confirm your email</p>", text: "Confirm your Pryrox email" },
          { template_key: "auth.password_reset", subject: "Reset your Pryrox password", html: "<p>Reset your password</p>", text: "Reset your Pryrox password" },
          { template_key: "auth.staff_invite", subject: "You're invited to join {{pharmacyName}} on Pryrox", html: "<p>You're invited</p>", text: "You're invited to join" },
          { template_key: "billing.payment_receipt", subject: "Pryrox receipt", html: "<p>Receipt</p>", text: "Receipt" },
          { template_key: "platform.admin_notice", subject: "Pryrox notice: {{title}}", html: "<p>Notice</p>", text: "Notice" },
        ];
        await Promise.all(defaults.map((t) => this.prisma.platform_email_templates.create({ data: { ...t, is_active: true } })));
        templates = await this.prisma.platform_email_templates.findMany({ orderBy: { template_key: "asc" } });
      }
      return {
        success: true,
        data: templates.map((t) => ({
          templateKey: t.template_key,
          subject: t.subject,
          isActive: t.is_active,
          preview: t.html.replace(/<[^>]*>/g, "").slice(0, 120),
          updatedAt: t.updated_at,
        })),
      };
    } catch (err) { return { success: false, error: String(err) }; }
  }

  async getEmailTemplate(params: { templateKey: string }): Promise<ToolResult> {
    try {
      const template = await this.prisma.platform_email_templates.findUnique({ where: { template_key: params.templateKey } });
      if (!template) return { success: false, error: `Template "${params.templateKey}" not found` };
      return {
        success: true,
        data: {
          templateKey: template.template_key,
          subject: template.subject,
          html: template.html,
          text: template.text,
          isActive: template.is_active,
          updatedAt: template.updated_at,
        },
      };
    } catch (err) { return { success: false, error: String(err) }; }
  }

  async updateEmailTemplateByAi(params: { templateKey: string; subject?: string; html?: string; text?: string; isActive?: boolean }): Promise<ToolResult> {
    try {
      if (!params.templateKey) return { success: false, error: "templateKey is required" };
      const data: Record<string, unknown> = { updated_at: new Date() };
      if (params.subject?.trim()) data.subject = params.subject.trim();
      if (params.html?.trim()) data.html = params.html.trim();
      if (params.text !== undefined) data.text = params.text?.trim() || null;
      if (params.isActive !== undefined) data.is_active = params.isActive;

      const template = await this.prisma.platform_email_templates.upsert({
        where: { template_key: params.templateKey },
        create: {
          template_key: params.templateKey,
          subject: params.subject ?? "No subject",
          html: params.html ?? "",
          text: params.text ?? null,
          is_active: params.isActive !== false,
        },
        update: data,
      });

      return {
        success: true,
        data: {
          message: `Email template "${params.templateKey}" updated successfully.`,
          template: { templateKey: template.template_key, subject: template.subject, isActive: template.is_active },
        },
      };
    } catch (err) { return { success: false, error: String(err) }; }
  }

  async draftEmail(params: { to: string; subject: string; html: string; text?: string }): Promise<ToolResult> {
    try {
      if (!params.to?.trim()) return { success: false, error: "Recipient email (to) is required" };
      if (!params.subject?.trim()) return { success: false, error: "Subject is required" };
      if (!params.html?.trim()) return { success: false, error: "HTML body is required" };

      const smtpConfigured = this.mail.isConfigured();

      return {
        success: true,
        data: {
          status: "awaiting_confirmation",
          smtpConfigured,
          to: params.to.trim(),
          subject: params.subject.trim(),
          html: params.html.trim(),
          text: params.text?.trim() || null,
          message: smtpConfigured
            ? "Email draft ready. Click Send to deliver it."
            : "Warning: SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env to enable email sending.",
        },
      };
    } catch (err) { return { success: false, error: String(err) }; }
  }

  async sendEmail(params: { to: string; subject: string; html: string; text?: string }): Promise<ToolResult> {
    try {
      if (!params.to?.trim()) return { success: false, error: "Recipient email (to) is required" };
      if (!params.subject?.trim()) return { success: false, error: "Subject is required" };
      if (!params.html?.trim()) return { success: false, error: "HTML body is required" };
      if (!this.mail.isConfigured()) return { success: false, error: "SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env." };

      await this.mail.sendMail({
        to: params.to.trim(),
        subject: params.subject.trim(),
        html: params.html.trim(),
        text: params.text?.trim(),
      });

      return { success: true, data: { message: `Email sent successfully to ${params.to.trim()}.` } };
    } catch (err) { return { success: false, error: String(err) }; }
  }

  async askUser(params: {
    question: string;
    fields: Array<{
      id: string;
      type: "text" | "choice" | "number";
      label: string;
      placeholder?: string;
      required?: boolean;
      options?: string[];
    }>;
  }): Promise<ToolResult> {
    return {
      success: true,
      data: {
        a2ui: true,
        questionId: `q_${Date.now()}`,
        surfaceId: "ask_user_surface",
        messages: [],
        question: params.question,
        fields: params.fields,
      },
    };
  }

  // ─── Tool dispatcher ─────────────────────────────────────────────────────

  async executeTool(name: string, args: Record<string, unknown>, ctx: { pharmacyId?: string; branchId?: string | null; scope: string; userId?: string }): Promise<unknown> {
    const pharmacyCtx: PharmacyToolContext = { pharmacyId: ctx.pharmacyId ?? "", branchId: ctx.branchId, userId: ctx.userId };

    switch (name) {
      case "check_inventory": return this.checkInventory(pharmacyCtx, args as any);
      case "get_sales_summary": return this.getSalesSummary(pharmacyCtx, args as any);
      case "lookup_patient": return this.lookupPatient(pharmacyCtx, args as any);
      case "update_user_profile": return this.updateUserProfile(ctx.userId, args as any);
      case "update_pharmacy_settings": return this.updatePharmacySettings(pharmacyCtx, args as any);
      case "update_platform_settings": return this.updatePlatformSettings(args as any);
      case "get_platform_stats": return this.getPlatformStats();
      case "list_all_pharmacies": return this.listAllPharmacies(args as any);
      case "get_ai_usage_stats": return this.getAiUsageStats();
      case "get_subscriber_stats": return this.getSubscriberStats();
      case "get_revenue_stats": return this.getRevenueStats();
      case "get_pharmacy_details": return this.getPharmacyDetails(args as any);
      case "get_subscription_overview": return this.getSubscriptionOverview();
      case "get_recent_activity": return this.getRecentActivity(args as any);
      case "get_plan_details": return this.getPlanDetails(args as any);
      case "compare_plans": return this.comparePlans();
      case "list_email_templates": return this.listEmailTemplates();
      case "get_email_template": return this.getEmailTemplate(args as any);
      case "update_email_template": return this.updateEmailTemplateByAi(args as any);
      case "draft_email": return this.draftEmail(args as any);
      case "ask_user": return this.askUser(args as any);
      default: return { success: false, error: `Unknown tool: ${name}` };
    }
  }

  getToolDefinitions(scope: "pharmacy" | "platform_admin") {
    const commonProfileTool = {
      name: "update_user_profile",
      description: "Update the currently logged-in user's profile display name or full name.",
      parameters: {
        type: "object",
        properties: {
          fullName: { type: "string", description: "The user's new display / full name" },
        },
        required: ["fullName"],
      },
    };

    const askUserTool = {
      name: "ask_user",
      description: "Ask the user interactive questions using a rich A2UI form component (with choices/radios, text inputs, numbers). ALWAYS call this tool when you need to gather options, choices, preferences (e.g., brand colors, typography/fonts, tone, layout options), or confirmation parameters instead of typing plain text bullet points.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "The title or header question for the form" },
          fields: {
            type: "array",
            description: "Form input fields for the user to fill or choose options from",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Unique identifier for this input field" },
                type: { type: "string", enum: ["text", "choice", "number"], description: "Type of input control" },
                label: { type: "string", description: "Label text for the input field" },
                placeholder: { type: "string", description: "Optional input placeholder" },
                required: { type: "boolean", description: "Whether this field is required" },
                options: {
                  type: "array",
                  items: { type: "string" },
                  description: "Array of choice option strings when type is 'choice'",
                },
              },
              required: ["id", "type", "label"],
            },
          },
        },
        required: ["question", "fields"],
      },
    };

    const pharmacy = [
      { name: "check_inventory", description: "Check inventory levels. Filter by query, low stock, or expiring soon.", parameters: { type: "object", properties: { query: { type: "string" }, lowStock: { type: "boolean" }, expiringSoon: { type: "boolean" } }, required: [] } },
      { name: "get_sales_summary", description: "Get sales summary for today, week, month, or year.", parameters: { type: "object", properties: { period: { type: "string", enum: ["today", "week", "month", "year"] } }, required: ["period"] } },
      { name: "lookup_patient", description: "Look up patient by name or phone.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
      commonProfileTool,
      askUserTool,
      {
        name: "update_pharmacy_settings",
        description: "Update active pharmacy settings such as pharmacy name, contact email, phone, or physical address.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "New pharmacy name" },
            email: { type: "string", description: "Pharmacy contact email" },
            phone: { type: "string", description: "Pharmacy contact phone" },
            address: { type: "string", description: "Pharmacy physical address" },
          },
          required: [],
        },
      },
    ];

    const admin = [
      { name: "get_platform_stats", description: "Platform-wide statistics: total pharmacies, active pharmacies, total users, recent signups, monthly revenue.", parameters: { type: "object", properties: {}, required: [] } },
      { name: "list_all_pharmacies", description: "List all pharmacies with name, status, user count. Filter by status.", parameters: { type: "object", properties: { status: { type: "string", description: "Filter by status: active, trial, expired" }, limit: { type: "number", description: "Max results (default 20)" } }, required: [] } },
      { name: "get_ai_usage_stats", description: "AI usage statistics: feature breakdown, token counts, latency.", parameters: { type: "object", properties: {}, required: [] } },
      { name: "get_subscriber_stats", description: "Get subscriber and subscription counts, breakdown by status and plan.", parameters: { type: "object", properties: {}, required: [] } },
      { name: "get_revenue_stats", description: "Revenue statistics: total revenue, last 30 days revenue, payment counts.", parameters: { type: "object", properties: {}, required: [] } },
      { name: "get_pharmacy_details", description: "Get detailed info for a specific pharmacy: status, plan, staff, subscriptions.", parameters: { type: "object", properties: { pharmacyId: { type: "string", description: "Pharmacy ID" }, name: { type: "string", description: "Pharmacy name (partial match)" } }, required: [] } },
      { name: "get_subscription_overview", description: "Overview of all subscriptions: total pharmacies, plan distribution, expiring soon.", parameters: { type: "object", properties: {}, required: [] } },
      { name: "get_recent_activity", description: "Recent activity: new pharmacies, payments, subscription changes in the last N days.", parameters: { type: "object", properties: { days: { type: "number", description: "Look back days (default 30)" } }, required: [] } },
      { name: "get_plan_details", description: "Get subscription plan details including pricing, limits, and feature list. Filter by plan name or ID, or leave empty for all active plans.", parameters: { type: "object", properties: { planName: { type: "string", description: "Plan name to look up (partial match)" }, planId: { type: "string", description: "Plan ID" } }, required: [] } },
      { name: "compare_plans", description: "Compare all active subscription plans side-by-side with pricing (monthly and yearly), billing period, limits, and feature matrix.", parameters: { type: "object", properties: {}, required: [] } },
      commonProfileTool,
      askUserTool,
      {
        name: "update_platform_settings",
        description: "Update platform administrator system settings e.g. maintenance mode, new user signups, or security IP whitelist.",
        parameters: {
          type: "object",
          properties: {
            maintenanceActive: { type: "boolean", description: "Enable or disable platform maintenance mode" },
            enableRegistrations: { type: "boolean", description: "Allow or disable new user signups" },
            ipWhitelistEnabled: { type: "boolean", description: "Enable or disable IP whitelist enforcement" },
          },
          required: [],
        },
      },
      { name: "list_email_templates", description: "List all platform email templates with template keys, subjects, active status, and content preview.", parameters: { type: "object", properties: {}, required: [] } },
      {
        name: "get_email_template",
        description: "Get the full content (HTML, subject, text) of a specific email template by its template key.",
        parameters: { type: "object", properties: { templateKey: { type: "string", description: "Template key, e.g. 'auth.signup_confirm', 'platform.admin_notice'" } }, required: ["templateKey"] },
      },
      {
        name: "update_email_template",
        description: "Update an email template's subject, HTML body, text body, or active status. Generate professional, responsive HTML email markup with inline CSS. Preserve template variables like {{variableName}}.",
        parameters: {
          type: "object",
          properties: {
            templateKey: { type: "string", description: "Template key to update" },
            subject: { type: "string", description: "New email subject line (may include {{variables}})" },
            html: { type: "string", description: "New HTML body — must be responsive with inline CSS, email-client safe" },
            text: { type: "string", description: "Plain text version of the email" },
            isActive: { type: "boolean", description: "Whether this template is active" },
          },
          required: ["templateKey"],
        },
      },
      {
        name: "draft_email",
        description: "Draft an email for the admin to review before sending. Returns a preview with a Send button in the chat. Always use this tool when the admin asks to write, compose, or send an email — never send directly without drafting first.",
        parameters: {
          type: "object",
          properties: {
            to: { type: "string", description: "Recipient email address" },
            subject: { type: "string", description: "Email subject line" },
            html: { type: "string", description: "HTML body (professional, responsive, inline CSS)" },
            text: { type: "string", description: "Plain text fallback" },
          },
          required: ["to", "subject", "html"],
        },
      },
    ];

    return (scope === "pharmacy" ? pharmacy : admin).map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: { ...t.parameters, type: "object" } },
    }));
  }
}
