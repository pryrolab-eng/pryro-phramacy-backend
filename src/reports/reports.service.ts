import { Injectable } from "@nestjs/common";
import { AccountingService } from "../accounting/accounting.service";
import { PrismaService } from "../prisma/prisma.service";
import { ClickhouseService } from "../clickhouse/clickhouse.service";

export type ReportRange = { from: string; to: string };
export type ReportScope = {
  pharmacyId: string;
  branchId?: string;
};

type InsuranceClaim = {
  id: string;
  claimNumber: string | null;
  insuranceType: string;
  providerId: string | null;
  patientName: string;
  insuranceNumber: string | null;
  date: string;
  status: string;
  totalClaim: number;
  patientCopay: number;
  items: Array<{
    drug: string;
    quantity: number;
    unitPrice: number;
    insurancePays: number;
    patientPays: number;
    externalCode?: string | null;
  }>;
};

function decimal(value: { toString(): string } | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === "number" ? value : Number(value);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoney(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

const DEFAULT_REPORT_CSS = `
  .insurance-monthly-report { font-family: system-ui, sans-serif; font-size: 12px; color: #111; }
  .insurance-monthly-report h1 { font-size: 18px; margin: 0 0 8px; }
  .insurance-monthly-report .meta { color: #444; margin-bottom: 16px; }
  .insurance-monthly-report .summary { margin: 16px 0; padding: 12px; border: 1px solid #ccc; }
  .insurance-monthly-report .claims-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  .insurance-monthly-report .claims-table th,
  .insurance-monthly-report .claims-table td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  .insurance-monthly-report .claims-table .num { text-align: right; }
  .insurance-monthly-report .claim-header td { background: #f3f4f6; font-weight: 600; }
  .insurance-monthly-report .empty { color: #666; font-style: italic; }
`;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly ch: ClickhouseService,
  ) {}

  private salesWhere(scope: ReportScope, range?: ReportRange) {
    return {
      pharmacy_id: scope.pharmacyId,
      ...(scope.branchId ? { branch_id: scope.branchId } : {}),
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

  async salesReport(scope: ReportScope, range: ReportRange) {
    // ── ClickHouse fast path ────────────────────────────────────────────────
    if (this.ch.isConfigured()) {
      try {
        const fromDay = range.from.slice(0, 10);
        const toDay = range.to.slice(0, 10);
        const [chSummary, topMeds] = await Promise.all([
          this.ch.getSalesSummary(scope.pharmacyId, fromDay, toDay, scope.branchId),
          this.ch.getTopMedications(scope.pharmacyId, fromDay, toDay, 8),
        ]);

        // We still need payment breakdown from Postgres (not in ClickHouse agg)
        const paymentRows = await this.prisma.sales.groupBy({
          by: ["payment_method"],
          where: this.salesWhere(scope, range),
          _sum: { total_amount: true },
          _count: { id: true },
        });
        const paymentTotals: Record<string, number> = {};
        for (const row of paymentRows) {
          const method = row.payment_method === "mobile_money" ? "Mobile Money"
            : row.payment_method === "cash" ? "Cash"
            : row.payment_method === "insurance" ? "Insurance"
            : "Card";
          paymentTotals[method] = (paymentTotals[method] ?? 0) + decimal(row._sum.total_amount);
        }

        return {
          dailySales: chSummary.dailySales.map((r) => ({ date: r.day, sales: r.revenue, orders: r.orders })),
          topProducts: topMeds.map((r) => ({ name: r.medication_name, sales: r.revenue, quantity: r.quantity })),
          paymentBreakdown: Object.entries(paymentTotals).map(([method, value]) => ({
            method,
            percentage: chSummary.totalRevenue > 0 ? Math.round((value / chSummary.totalRevenue) * 100) : 0,
            amount: Math.round(value),
          })),
          totalSales: chSummary.totalRevenue,
          totalOrders: chSummary.totalOrders,
          activeCustomers: 0, // not tracked in ClickHouse agg
          branchId: scope.branchId ?? null,
          source: "clickhouse",
        };
      } catch {
        // Fall through to Postgres
      }
    }

    // ── Postgres fallback ──────────────────────────────────────────────────
    const [sales, items] = await Promise.all([
      this.prisma.sales.findMany({
        where: this.salesWhere(scope, range),
        select: {
          total_amount: true,
          created_at: true,
          id: true,
          customer_name: true,
          payment_method: true,
        },
        orderBy: { created_at: "asc" },
      }),
      this.prisma.sale_items.findMany({
        where: { sales: this.salesWhere(scope, range) },
        select: { medication_name: true, total_price: true, quantity: true },
      }),
    ]);
    const dailyTotals: Record<string, { sales: number; orders: number }> = {};
    for (const sale of sales) {
      const date = (sale.created_at?.toISOString() ?? new Date().toISOString()).split("T")[0]!;
      dailyTotals[date] ??= { sales: 0, orders: 0 };
      dailyTotals[date].sales += decimal(sale.total_amount);
      dailyTotals[date].orders += 1;
    }
    const productTotals: Record<string, { sales: number; quantity: number }> = {};
    for (const item of items) {
      productTotals[item.medication_name] ??= { sales: 0, quantity: 0 };
      productTotals[item.medication_name].sales += decimal(item.total_price);
      productTotals[item.medication_name].quantity += item.quantity;
    }
    const paymentTotals: Record<string, number> = {};
    let totalAmount = 0;
    for (const sale of sales) {
      const method = sale.payment_method === "mobile_money" ? "Mobile Money"
        : sale.payment_method === "cash" ? "Cash"
        : sale.payment_method === "insurance" ? "Insurance"
        : "Card";
      paymentTotals[method] = (paymentTotals[method] ?? 0) + decimal(sale.total_amount);
      totalAmount += decimal(sale.total_amount);
    }
    return {
      dailySales: Object.entries(dailyTotals)
        .map(([date, row]) => ({ date, sales: Math.round(row.sales), orders: row.orders }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      topProducts: Object.entries(productTotals)
        .map(([name, row]) => ({ name, sales: Math.round(row.sales), quantity: row.quantity }))
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 8),
      paymentBreakdown: Object.entries(paymentTotals).map(([method, value]) => ({
        method,
        percentage: totalAmount > 0 ? Math.round((value / totalAmount) * 100) : 0,
        amount: Math.round(value),
      })),
      totalSales: Math.round(totalAmount),
      totalOrders: sales.length,
      activeCustomers: new Set(sales.map((row) => row.customer_name).filter(Boolean)).size,
      branchId: scope.branchId ?? null,
    };
  }

  async inventoryReport(pharmacyId: string) {
    const since = new Date(Date.now() - 14 * 86_400_000);
    const rows = await this.prisma.inventory.findMany({
      where: {
        pharmacy_id: pharmacyId,
        created_at: { gte: since },
        medications: { pharmacy_id: pharmacyId },
      },
      select: {
        quantity_in_stock: true,
        minimum_stock_level: true,
        expiry_date: true,
        created_at: true,
      },
      orderBy: { created_at: "asc" },
    });
    const daily: Record<string, { lowStock: number; expiring: number; totalItems: number }> = {};
    for (const item of rows) {
      const date = (item.created_at?.toISOString() ?? new Date().toISOString()).split("T")[0];
      daily[date] ??= { lowStock: 0, expiring: 0, totalItems: 0 };
      daily[date].totalItems += 1;
      if ((item.quantity_in_stock ?? 0) <= (item.minimum_stock_level ?? 0)) {
        daily[date].lowStock += 1;
      }
      if (item.expiry_date) {
        const days = Math.ceil((item.expiry_date.getTime() - Date.now()) / 86_400_000);
        if (days <= 60 && days > 0) daily[date].expiring += 1;
      }
    }
    return {
      inventoryAlerts: Object.entries(daily).map(([date, row]) => ({ date, ...row })),
    };
  }

  async salesRows(scope: ReportScope, range: ReportRange) {
    const rows = await this.prisma.sales.findMany({
      where: this.salesWhere(scope, range),
      select: {
        total_amount: true,
        created_at: true,
        id: true,
        customer_name: true,
        payment_method: true,
      },
      orderBy: { created_at: "asc" },
    });
    return rows.map((row) => ({
      total_amount: decimal(row.total_amount),
      created_at: row.created_at?.toISOString() ?? new Date().toISOString(),
      id: row.id,
      customer_name: row.customer_name,
      payment_method: row.payment_method,
    }));
  }

  async financialReport(scope: ReportScope, range: ReportRange) {
    const sales = await this.salesRows(scope, range);
    const buckets = { cash: 0, card: 0, mobile_money: 0, insurance: 0, mixed: 0 };
    let totalSales = 0;
    for (const row of sales) {
      totalSales += row.total_amount;
      const method = row.payment_method ?? "cash";
      if (method in buckets) {
        buckets[method as keyof typeof buckets] += row.total_amount;
      } else {
        buckets.cash += row.total_amount;
      }
    }
    const end = new Date(range.to);
    end.setUTCDate(end.getUTCDate() + 1);
    const accounting = await this.accounting.buildSummary(scope.pharmacyId, {
      from: new Date(range.from),
      to: end,
    });
    return {
      period: this.formatPeriod(range),
      revenue: {
        totalSales,
        cashSales: buckets.cash,
        insuranceSales: buckets.insurance,
        mobileMoneySales: buckets.mobile_money,
        cardSales: buckets.card,
        mixedSales: buckets.mixed,
      },
      expenses: {
        inventory: accounting.categories.inventory,
        supplierPurchases: accounting.categories.supplierPurchases,
        salaries: accounting.categories.salaries,
        utilities: accounting.categories.utilities,
        rent: accounting.categories.rent,
        other: accounting.categories.other,
        total: accounting.expenses,
        categories: accounting.categoryBreakdown,
        sources: accounting.sources,
        note:
          "Expenses use purchase orders and estimated staff salaries. Rent, utilities, and fiscal submission data are reserved extension points.",
      },
      profitLoss: {
        grossProfit: totalSales - accounting.categories.inventory,
        netProfit: accounting.profit,
        profitMargin: accounting.profitMargin,
      },
      cashFlow: {
        opening: 0,
        inflow: accounting.cashFlow.inflow,
        outflow: accounting.cashFlow.outflow,
        closing: accounting.cashFlow.net,
        note:
          "Cash flow is derived from sales, completed payments, payment transactions, purchase orders, and salary estimates.",
      },
    };
  }

  async taxReport(scope: ReportScope, range: ReportRange) {
    const sales = await this.salesRows(scope, range);
    const totalSales = sales.reduce((sum, row) => sum + row.total_amount, 0);
    return {
      period: this.formatPeriod(range),
      vatSummary: {
        totalSales,
        vatableSales: totalSales,
        vatAmount: Math.round(totalSales * 0.18),
        vatRate: 18,
      },
      transactions: sales.slice(-50).map((row) => ({
        date: row.created_at.split("T")[0],
        invoice: row.id,
        amount: row.total_amount,
        vat: Math.round(row.total_amount * 0.18),
        customer: row.customer_name ?? "Walk-in Customer",
      })),
      rraSubmission: {
        status: "not_connected",
        note: "Live RRA submission requires EBM integration — see ebm-integration-decision-brief.md",
      },
    };
  }

  async auditLoggingEnabled(): Promise<boolean> {
    const setting = await this.prisma.system_settings.findFirst({
      where: { pharmacy_id: null, setting_key: "enableAuditLogs" },
      select: { setting_value: true },
    });
    const value = setting?.setting_value;
    if (value == null) return true;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      return !["false", "0", "off", "no"].includes(value.toLowerCase());
    }
    return Boolean(value);
  }

  async auditReport(pharmacyId: string) {
    const rows = await this.prisma.audit_logs.findMany({
      where: { pharmacy_id: pharmacyId },
      orderBy: { created_at: "desc" },
      take: 50,
      select: {
        id: true,
        action: true,
        table_name: true,
        record_id: true,
        user_id: true,
        created_at: true,
      },
    });
    const userIds = Array.from(
      new Set(rows.map((row) => row.user_id).filter((id): id is string => Boolean(id))),
    );
    const profiles = userIds.length
      ? await this.prisma.public_users.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, name: true },
        })
      : [];
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));
    return rows.map((row) => {
      const profile = row.user_id ? byId.get(row.user_id) : null;
      return {
        id: row.id,
        user: profile?.email ?? profile?.name ?? row.user_id ?? "system",
        action: row.action,
        details:
          [row.table_name, row.record_id].filter(Boolean).join(" · ") || row.action,
        timestamp: row.created_at?.toISOString() ?? null,
      };
    });
  }

  async combinedReport(scope: ReportScope, range: ReportRange) {
    const today = new Date().toISOString().split("T")[0];
    const [salesReport, inventoryReport, categoryRows, rangeSales, todaySales, totalProducts, activeStaff] =
      await Promise.all([
        this.salesReport(scope, range),
        this.inventoryReport(scope.pharmacyId),
        this.prisma.sale_items.findMany({
          where: { sales: this.salesWhere(scope) },
          select: {
            total_price: true,
            inventory: { select: { medications: { select: { category: true } } } },
          },
        }),
        this.prisma.sales.findMany({
          where: this.salesWhere(scope, range),
          select: { total_amount: true, customer_name: true, id: true },
        }),
        this.prisma.sales.findMany({
          where: {
            ...this.salesWhere(scope),
            created_at: { gte: new Date(`${today}T00:00:00.000Z`) },
          },
          select: { total_amount: true },
        }),
        this.prisma.medications.count({ where: { pharmacy_id: scope.pharmacyId } }),
        this.prisma.pharmacy_users.count({
          where: { pharmacy_id: scope.pharmacyId, is_active: true },
        }),
      ]);
    const categoryTotals: Record<string, number> = {};
    for (const row of categoryRows) {
      const category = row.inventory?.medications?.category ?? "other";
      categoryTotals[category] = (categoryTotals[category] ?? 0) + decimal(row.total_price);
    }
    const monthlyRevenue = rangeSales.reduce(
      (sum, row) => sum + decimal(row.total_amount),
      0,
    );
    return {
      salesReport,
      inventoryReport,
      categorySales: Object.entries(categoryTotals).map(([category, sales]) => ({
        category,
        sales: Math.round(sales),
        fill: `var(--color-${category})`,
      })),
      dashboardStats: {
        totalProducts,
        lowStockItems: 0,
        todaySales: Math.round(
          todaySales.reduce((sum, row) => sum + decimal(row.total_amount), 0),
        ),
        monthlyRevenue: Math.round(monthlyRevenue),
        totalCustomers: new Set(
          rangeSales.map((row) => row.customer_name).filter(Boolean),
        ).size,
        activeStaff,
        pendingOrders: rangeSales.length,
        expiringProducts: 0,
        branchId: scope.branchId ?? null,
      },
    };
  }

  async insuranceClaimsReport(input: {
    pharmacyId: string;
    month: number;
    year: number;
    providerId: string | null;
    providerName: string | null;
  }) {
    let providerName = input.providerName;
    if (input.providerId && !providerName) {
      const provider = await this.prisma.insurance_providers.findUnique({
        where: { id: input.providerId, is_active: true },
        select: { name: true },
      });
      providerName = provider?.name ?? null;
    }
    const period = this.insurancePeriod(input.month, input.year);
    const [pharmacy, rows] = await Promise.all([
      this.prisma.pharmacies.findUnique({
        where: { id: input.pharmacyId },
        select: { id: true, name: true, address: true, phone: true, email: true },
      }),
      this.prisma.insurance_claims.findMany({
        where: {
          pharmacy_id: input.pharmacyId,
          created_at: { gte: new Date(period.from), lte: new Date(period.to) },
          ...(input.providerId
            ? { insurance_provider_id: input.providerId }
            : {}),
        },
        orderBy: { created_at: "asc" },
        include: {
          insurance_providers: { select: { name: true } },
          insurance_claim_lines: {
            select: {
              medication_name: true,
              quantity: true,
              shelf_unit_price: true,
              insurer_amount: true,
              patient_amount: true,
              external_code: true,
            },
          },
        },
      }),
    ]);
    if (!pharmacy) throw new Error("Pharmacy not found");
    const claims: InsuranceClaim[] = [];
    for (const row of rows) {
      let items = row.insurance_claim_lines.map((line) => ({
        drug: String(line.medication_name ?? "Unknown"),
        quantity: line.quantity || 1,
        unitPrice: decimal(line.shelf_unit_price),
        insurancePays: decimal(line.insurer_amount),
        patientPays: decimal(line.patient_amount),
        externalCode: line.external_code,
      }));
      if (!items.length && row.sale_id) {
        const saleItems = await this.prisma.sale_items.findMany({
          where: { sale_id: row.sale_id },
          select: {
            medication_name: true,
            quantity: true,
            unit_price: true,
            total_price: true,
          },
        });
        items = saleItems.map((item) => {
          const quantity = item.quantity || 1;
          const unitPrice = decimal(item.unit_price);
          return {
            drug: item.medication_name ?? "Unknown",
            quantity,
            unitPrice,
            insurancePays: decimal(item.total_price) || unitPrice * quantity,
            patientPays: 0,
            externalCode: null,
          };
        });
      }
      claims.push({
        id: row.id,
        claimNumber: row.claim_number,
        insuranceType: row.insurance_providers?.name ?? "Unknown",
        providerId: row.insurance_provider_id,
        patientName: row.patient_name,
        insuranceNumber: row.patient_id_number,
        date: (row.created_at?.toISOString() ?? new Date().toISOString()).slice(0, 10),
        status: String(row.status ?? "pending"),
        totalClaim:
          decimal(row.covered_amount) ||
          decimal(row.claim_amount) ||
          items.reduce((sum, item) => sum + item.insurancePays, 0),
        patientCopay:
          decimal(row.patient_copay) ||
          items.reduce((sum, item) => sum + item.patientPays, 0),
        items,
      });
    }
    const byInsurance: Record<string, { count: number; insurerAmount: number; patientCopay: number }> = {};
    let totalInsurerAmount = 0;
    let totalPatientCopay = 0;
    for (const claim of claims) {
      totalInsurerAmount += claim.totalClaim;
      totalPatientCopay += claim.patientCopay;
      byInsurance[claim.insuranceType] ??= { count: 0, insurerAmount: 0, patientCopay: 0 };
      byInsurance[claim.insuranceType].count += 1;
      byInsurance[claim.insuranceType].insurerAmount += claim.totalClaim;
      byInsurance[claim.insuranceType].patientCopay += claim.patientCopay;
    }
    const report = {
      period,
      pharmacy,
      claims,
      summary: {
        totalClaims: claims.length,
        totalInsurerAmount,
        totalPatientCopay,
        byInsurance,
      },
    };
    let template: {
      id: string;
      name: string;
      insurance_provider: string;
      template_html: string;
      template_css: string;
    } | null = null;
    let renderedHtml: string | null = null;
    let renderedCss: string | null = null;
    if (providerName) {
      const templates = await this.prisma.insurance_templates.findMany({
        where: {
          is_active: true,
          OR: [{ pharmacy_id: null }, { pharmacy_id: input.pharmacyId }],
        },
        select: {
          id: true,
          name: true,
          insurance_provider: true,
          template_html: true,
          template_css: true,
          pharmacy_id: true,
        },
        orderBy: { pharmacy_id: { sort: "desc", nulls: "last" } },
      });
      const match = templates.find(
        (row) =>
          row.insurance_provider.trim().toLowerCase() === providerName!.toLowerCase(),
      );
      template = match
        ? {
            id: match.id,
            name: match.name,
            insurance_provider: match.insurance_provider,
            template_html: match.template_html ?? "",
            template_css: match.template_css ?? "",
          }
        : null;
      const rendered = this.renderInsuranceReport(report, providerName, template);
      renderedHtml = rendered.html;
      renderedCss = rendered.css;
    }
    return {
      month: period.month,
      year: period.year,
      period: { from: period.from, to: period.to },
      pharmacy: report.pharmacy,
      claims,
      summary: {
        totalClaims: claims.length,
        totalAmount: totalInsurerAmount,
        totalPatientCopay,
        byInsurance: Object.fromEntries(
          Object.entries(byInsurance).map(([name, row]) => [name, row.insurerAmount]),
        ),
        byInsuranceDetail: byInsurance,
      },
      template: template
        ? {
            id: template.id,
            name: template.name,
            insurance_provider: template.insurance_provider,
          }
        : null,
      renderedHtml,
      renderedCss,
    };
  }

  private formatPeriod(range: ReportRange): string {
    return `${new Date(range.from).toLocaleDateString()} – ${new Date(range.to).toLocaleDateString()}`;
  }

  private insurancePeriod(month: number, year: number) {
    const safeMonth = Math.min(12, Math.max(1, month));
    const safeYear = year > 1970 ? year : new Date().getFullYear();
    return {
      month: safeMonth,
      year: safeYear,
      from: new Date(safeYear, safeMonth - 1, 1, 0, 0, 0, 0).toISOString(),
      to: new Date(safeYear, safeMonth, 0, 23, 59, 59, 999).toISOString(),
    };
  }

  private claimsTable(claims: InsuranceClaim[], providerName?: string): string {
    const rows = claims.filter(
      (claim) =>
        !providerName ||
        claim.insuranceType.toLowerCase() === providerName.toLowerCase(),
    );
    if (!rows.length) return '<p class="empty">No insurance claims for this period.</p>';
    const body = rows
      .map((claim) => {
        const items = claim.items
          .map(
            (item) => `<tr>
              <td>${escapeHtml(item.drug)}</td>
              <td class="code">${escapeHtml(item.externalCode ?? "—")}</td>
              <td class="num">${item.quantity}</td>
              <td class="num">${formatMoney(item.unitPrice)}</td>
              <td class="num">${formatMoney(item.insurancePays)}</td>
              <td class="num">${formatMoney(item.patientPays)}</td>
            </tr>`,
          )
          .join("");
        return `
        <tbody class="claim-group">
          <tr class="claim-header">
            <td colspan="6">
              <strong>${escapeHtml(claim.patientName)}</strong>
              · ${escapeHtml(claim.insuranceNumber ?? "—")}
              · ${escapeHtml(claim.date)}
              · ${escapeHtml(claim.status)}
              · Claim ${formatMoney(claim.totalClaim)} RWF
            </td>
          </tr>
          ${items || '<tr><td colspan="6">No line items</td></tr>'}
        </tbody>`;
      })
      .join("");
    return `
    <table class="claims-table">
      <thead>
        <tr>
          <th>Product</th><th>Code</th><th>Qty</th><th>Unit (RWF)</th>
          <th>Insurer (RWF)</th><th>Patient (RWF)</th>
        </tr>
      </thead>
      ${body}
    </table>`;
  }

  private renderInsuranceReport(
    report: {
      period: { month: number; year: number };
      pharmacy: { name: string; address: string | null; phone: string | null; email: string | null };
      claims: InsuranceClaim[];
    },
    providerName: string,
    template: { template_html: string; template_css: string } | null,
  ) {
    const filtered = report.claims.filter(
      (claim) => claim.insuranceType.toLowerCase() === providerName.toLowerCase(),
    );
    const insurerTotal = filtered.reduce((sum, claim) => sum + claim.totalClaim, 0);
    const patientTotal = filtered.reduce((sum, claim) => sum + claim.patientCopay, 0);
    if (!template?.template_html.trim()) {
      return {
        html: `
    <div class="insurance-monthly-report">
      <h1>Insurance claims — ${escapeHtml(providerName)}</h1>
      <p class="meta">
        ${escapeHtml(report.pharmacy.name)}
        · ${report.period.month}/${report.period.year}
      </p>
      <div class="summary">
        <p><strong>Claims:</strong> ${filtered.length}</p>
        <p><strong>Insurer total:</strong> ${formatMoney(insurerTotal)} RWF</p>
        <p><strong>Patient copay:</strong> ${formatMoney(patientTotal)} RWF</p>
      </div>
      ${this.claimsTable(report.claims, providerName)}
    </div>`,
        css: DEFAULT_REPORT_CSS,
      };
    }
    const values: Record<string, string> = {
      pharmacy_name: report.pharmacy.name,
      pharmacy_address: report.pharmacy.address ?? "",
      pharmacy_phone: report.pharmacy.phone ?? "",
      pharmacy_email: report.pharmacy.email ?? "",
      insurance_provider: providerName,
      report_month: String(report.period.month),
      report_year: String(report.period.year),
      total_claim_amount: formatMoney(insurerTotal),
      total_patient_copay: formatMoney(patientTotal),
      claim_count: String(filtered.length),
      claims_table: this.claimsTable(report.claims, providerName),
    };
    let html = template.template_html;
    for (const [key, value] of Object.entries(values)) {
      html = html.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi"), value);
    }
    return {
      html,
      css: `${template.template_css.trim()}\n${DEFAULT_REPORT_CSS}`,
    };
  }
}
