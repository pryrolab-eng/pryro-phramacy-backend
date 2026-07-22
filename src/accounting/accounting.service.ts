import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type AccountingRange = { from: Date; to: Date };

function amount(value: { toString(): string } | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === "number" ? value : Number(value);
}

function daysInRange(range: AccountingRange): number {
  return Math.max(1, Math.ceil((range.to.getTime() - range.from.getTime()) / 86_400_000));
}

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  async listExpenses(
    pharmacyId: string,
    range: { from?: Date; to?: Date },
  ) {
    return this.prisma.accounting_expenses.findMany({
      where: {
        pharmacy_id: pharmacyId,
        ...(range.from || range.to
          ? {
              expense_date: {
                ...(range.from ? { gte: range.from } : {}),
                ...(range.to ? { lt: range.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { expense_date: "desc" },
      take: 200,
    });
  }

  createExpense(input: {
    pharmacyId: string;
    category: string;
    amount: number;
    description: string | null;
    expenseDate: string | null;
    createdBy: string;
  }) {
    return this.prisma.accounting_expenses.create({
      data: {
        pharmacy_id: input.pharmacyId,
        category: input.category,
        amount: input.amount,
        description: input.description,
        expense_date: input.expenseDate ? new Date(input.expenseDate) : new Date(),
        source: "manual",
        created_by: input.createdBy,
      },
    });
  }

  async deleteExpense(id: string, pharmacyId: string): Promise<boolean> {
    const result = await this.prisma.accounting_expenses.deleteMany({
      where: { id, pharmacy_id: pharmacyId },
    });
    return result.count > 0;
  }

  async buildSummary(pharmacyId: string, range: AccountingRange) {
    const [
      salesAgg,
      purchaseOrders,
      staffRows,
      payments,
      invoices,
      transactions,
      manualExpenses,
    ] = await Promise.all([
      this.prisma.sales.aggregate({
        where: {
          pharmacy_id: pharmacyId,
          status: "completed",
          created_at: { gte: range.from, lt: range.to },
        },
        _sum: { total_amount: true },
      }),
      this.prisma.purchase_orders.findMany({
        where: {
          pharmacy_id: pharmacyId,
          order_date: { gte: range.from, lt: range.to },
          status: { notIn: ["cancelled", "voided"] },
        },
        select: { total_amount: true },
      }),
      this.prisma.staff.findMany({
        where: { pharmacy_id: pharmacyId, is_active: true },
        select: { salary: true },
      }),
      this.prisma.payments.findMany({
        where: {
          pharmacy_id: pharmacyId,
          created_at: { gte: range.from, lt: range.to },
        },
        select: { amount: true, status: true },
      }),
      this.prisma.invoices.findMany({
        where: {
          pharmacy_id: pharmacyId,
          created_at: { gte: range.from, lt: range.to },
        },
        select: { amount: true, status: true },
      }),
      this.prisma.payment_transactions.findMany({
        where: {
          pharmacy_id: pharmacyId,
          created_at: { gte: range.from, lt: range.to },
        },
        select: { amount: true, status: true },
      }),
      this.prisma.accounting_expenses.findMany({
        where: {
          pharmacy_id: pharmacyId,
          expense_date: { gte: range.from, lt: range.to },
        },
        select: { category: true, amount: true },
      }),
    ]);

    const revenue = amount(salesAgg._sum.total_amount);
    const supplierPurchases = purchaseOrders.reduce(
      (sum, row) => sum + amount(row.total_amount),
      0,
    );
    const monthlySalaries = staffRows.reduce(
      (sum, row) => sum + amount(row.salary),
      0,
    );
    const salaries = Math.round((monthlySalaries * daysInRange(range)) / 30.44);
    const manualExpenseTotal = manualExpenses.reduce(
      (sum, row) => sum + amount(row.amount),
      0,
    );
    const expenseByCategory = manualExpenses.reduce<Record<string, number>>(
      (result, row) => {
        const key = row.category.trim().toLowerCase() || "other";
        result[key] = (result[key] ?? 0) + amount(row.amount);
        return result;
      },
      {},
    );
    const rent = expenseByCategory.rent ?? 0;
    const utilities = expenseByCategory.utilities ?? 0;
    const other = Object.entries(expenseByCategory)
      .filter(([key]) => key !== "rent" && key !== "utilities")
      .reduce((sum, [, value]) => sum + value, 0);
    const expenses = supplierPurchases + salaries + manualExpenseTotal;
    const profit = revenue - expenses;
    const completedPayments = payments
      .filter((row) => row.status === "completed")
      .reduce((sum, row) => sum + amount(row.amount), 0);
    const completedTransactions = transactions
      .filter((row) => row.status === "completed" || row.status === "success")
      .reduce((sum, row) => sum + amount(row.amount), 0);
    const outstandingInvoices = invoices
      .filter((row) => row.status !== "paid")
      .reduce((sum, row) => sum + amount(row.amount), 0);

    return {
      revenue,
      expenses,
      profit,
      profitMargin: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0,
      categories: {
        inventory: supplierPurchases,
        supplierPurchases,
        salaries,
        rent,
        utilities,
        other,
      },
      categoryBreakdown: [
        { category: "Inventory purchases", amount: supplierPurchases, source: "live" },
        { category: "Staff salaries", amount: salaries, source: "estimated" },
        { category: "Rent", amount: rent, source: rent > 0 ? "live" : "unavailable" },
        { category: "Utilities", amount: utilities, source: utilities > 0 ? "live" : "unavailable" },
        { category: "Other", amount: other, source: other > 0 ? "live" : "unavailable" },
      ],
      cashFlow: {
        inflow: revenue + completedPayments + completedTransactions,
        outflow: expenses,
        net: revenue + completedPayments + completedTransactions - expenses,
      },
      sources: {
        revenue: "sales",
        inventory: "purchase_orders",
        supplierPurchases: "purchase_orders",
        salaries: "staff.salary_estimate",
        rent: rent > 0 ? "live.manual_entry" : "unavailable",
        utilities: utilities > 0 ? "live.manual_entry" : "unavailable",
        other: other > 0 ? "live.manual_entry" : "unavailable",
        fiscalSubmission: "deferred_rra_ebm",
      },
      paymentSummary: {
        completedPayments,
        completedTransactions,
        outstandingInvoices,
      },
    };
  }
}
