import { Injectable } from "@nestjs/common";
import type {
  payment_method,
  Prisma,
  sale_status,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type RegisteredCustomerIndex = {
  byPhone: Set<string>;
  byName: Set<string>;
};

const PAYMENT_METHODS = [
  "cash",
  "card",
  "mobile_money",
  "insurance",
  "mixed",
] as const;

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  private decimal(value: unknown): number {
    return value == null ? 0 : Number(value);
  }

  private parseListQuery(query: Record<string, string | undefined>) {
    const period =
      query.period === "today" ||
      query.period === "week" ||
      query.period === "month" ||
      query.period === "all"
        ? query.period
        : "all";
    const q = query.q?.trim() || undefined;
    const from = query.from ?? undefined;
    const to = query.to ?? undefined;
    const limitRaw = Number(query.limit ?? "100");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), 200)
      : 100;
    const pageRaw = Number(query.page ?? "1");
    const page =
      Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
    return { period, q, from, to, limit, page };
  }

  private listDateRange(query: ReturnType<SalesService["parseListQuery"]>) {
    if (query.from && query.to) {
      return { from: new Date(query.from), to: new Date(query.to) };
    }
    const to = new Date();
    if (query.period === "all") return { to };
    const from = new Date();
    if (query.period === "today") {
      from.setHours(0, 0, 0, 0);
    } else if (query.period === "week") {
      from.setTime(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (query.period === "month") {
      from.setTime(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }
    return { from, to };
  }

  async list(
    pharmacyId: string,
    queryInput: Record<string, string | undefined>,
  ) {
    const query = this.parseListQuery(queryInput);
    const { from, to } = this.listDateRange(query);
    const where: Prisma.salesWhereInput = { pharmacy_id: pharmacyId };
    if (from || to) {
      where.created_at = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    if (query.q) {
      const lower = query.q.toLowerCase();
      const methods = PAYMENT_METHODS.filter((method) =>
        method.includes(lower),
      );
      where.OR = [
        {
          customer_name: {
            contains: query.q,
            mode: "insensitive",
          },
        },
        ...(methods.length
          ? [{ payment_method: { in: methods as payment_method[] } }]
          : []),
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [sales, totalSalesCount] = await Promise.all([
      this.prisma.sales.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: query.limit,
      }),
      this.prisma.sales.count({ where }),
    ]);
    const saleIds = sales.map((sale) => sale.id);
    const itemCounts = saleIds.length
      ? await this.prisma.sale_items.groupBy({
          by: ["sale_id"],
          where: { sale_id: { in: saleIds } },
          _count: { _all: true },
        })
      : [];
    const itemCountBySaleId = new Map(
      itemCounts.map((row) => [row.sale_id, row._count._all]),
    );
    const formattedSales = sales.map((sale) => ({
      id: sale.id,
      customer: sale.customer_name || "Walk-in Customer",
      amount: sale.total_amount,
      items: itemCountBySaleId.get(sale.id) ?? 0,
      date: sale.created_at?.toISOString().split("T")[0] ?? "",
      paymentMethod: sale.payment_method,
      status: sale.status,
    }));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [todayAgg, weekAgg, monthAgg] = await Promise.all([
      this.prisma.sales.aggregate({
        where: { pharmacy_id: pharmacyId, created_at: { gte: today } },
        _sum: { total_amount: true },
      }),
      this.prisma.sales.aggregate({
        where: { pharmacy_id: pharmacyId, created_at: { gte: weekAgo } },
        _sum: { total_amount: true },
      }),
      this.prisma.sales.aggregate({
        where: { pharmacy_id: pharmacyId, created_at: { gte: monthAgo } },
        _sum: { total_amount: true },
      }),
    ]);
    return {
      sales: formattedSales,
      stats: {
        todayTotal: Number(todayAgg._sum.total_amount ?? 0),
        weekTotal: Number(weekAgg._sum.total_amount ?? 0),
        monthTotal: Number(monthAgg._sum.total_amount ?? 0),
        totalSales: totalSalesCount,
      },
      total: totalSalesCount,
      page: query.page,
      limit: query.limit,
    };
  }

  async create(pharmacyId: string, body: Record<string, unknown>) {
    const sale = body.sale as Record<string, unknown>;
    const items = body.items as
      | Array<{
          inventory_id: string;
          medication_name: string;
          quantity: number;
          unit_price: number;
          total_price: number;
        }>
      | undefined;

    return this.prisma.$transaction(async (tx) => {
      const newSale = await tx.sales.create({
        data: {
          pharmacy_id: pharmacyId,
          customer_name: (sale.customer_name as string) || "Walk-in Customer",
          subtotal: sale.subtotal as number,
          insurance_amount: (sale.insurance_amount as number) || 0,
          customer_amount: sale.customer_amount as number,
          total_amount: sale.total_amount as number,
          payment_method: sale.payment_method as payment_method,
          status: sale.status as sale_status,
          receipt_number: `RCP-${Date.now()}`,
        },
      });

      if (items && items.length > 0) {
        await tx.sale_items.createMany({
          data: items.map((item) => ({
            sale_id: newSale.id,
            inventory_id: item.inventory_id,
            medication_name: item.medication_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.total_price,
          })),
        });

        for (const item of items) {
          const updated = await tx.inventory.updateMany({
            where: {
              id: item.inventory_id,
              pharmacy_id: pharmacyId,
              quantity_in_stock: { gte: item.quantity },
            },
            data: { quantity_in_stock: { decrement: item.quantity } },
          });
          if (updated.count === 0) {
            throw new Error(
              `Insufficient stock for ${item.medication_name}`,
            );
          }
        }
      }

      return newSale;
    });
  }

  private reportWhere(
    pharmacyId: string,
    branchId: string | null,
    range?: { from: Date; to: Date },
  ): Prisma.salesWhereInput {
    return {
      pharmacy_id: pharmacyId,
      ...(branchId ? { branch_id: branchId } : {}),
      ...(range ? { created_at: { gte: range.from, lte: range.to } } : {}),
    };
  }

  private buildSalesReport(
    sales: Array<{
      id: string;
      total_amount: unknown;
      created_at: Date | null;
      customer_name: string | null;
      payment_method: payment_method | null;
    }>,
    items: Array<{
      medication_name: string;
      total_price: unknown;
      quantity: number;
    }>,
    branchId: string | null,
  ) {
    const dailyTotals: Record<string, { sales: number; orders: number }> = {};
    for (const sale of sales) {
      const date = (sale.created_at?.toISOString() ?? new Date().toISOString())
        .split("T")[0]!;
      dailyTotals[date] ??= { sales: 0, orders: 0 };
      dailyTotals[date].sales += this.decimal(sale.total_amount);
      dailyTotals[date].orders += 1;
    }
    const dailySales = Object.entries(dailyTotals)
      .map(([date, row]) => ({
        date,
        sales: Math.round(row.sales),
        orders: row.orders,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const productTotals: Record<
      string,
      { sales: number; quantity: number }
    > = {};
    for (const item of items) {
      productTotals[item.medication_name] ??= { sales: 0, quantity: 0 };
      productTotals[item.medication_name].sales += this.decimal(
        item.total_price,
      );
      productTotals[item.medication_name].quantity += item.quantity;
    }
    const topProducts = Object.entries(productTotals)
      .map(([name, value]) => ({
        name,
        sales: Math.round(value.sales),
        quantity: value.quantity,
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 8);

    const paymentTotals: Record<string, number> = {};
    let totalAmount = 0;
    for (const sale of sales) {
      const method =
        sale.payment_method === "mobile_money"
          ? "Mobile Money"
          : sale.payment_method === "cash"
            ? "Cash"
            : sale.payment_method === "insurance"
              ? "Insurance"
              : "Card";
      const amount = this.decimal(sale.total_amount);
      paymentTotals[method] = (paymentTotals[method] || 0) + amount;
      totalAmount += amount;
    }
    const paymentBreakdown = Object.entries(paymentTotals).map(
      ([method, amount]) => ({
        method,
        percentage:
          totalAmount > 0 ? Math.round((amount / totalAmount) * 100) : 0,
        amount: Math.round(amount),
      }),
    );
    return {
      dailySales,
      topProducts,
      paymentBreakdown,
      totalSales: Math.round(totalAmount),
      totalOrders: sales.length,
      activeCustomers: new Set(
        sales.map((sale) => sale.customer_name).filter(Boolean),
      ).size,
      branchId,
    };
  }

  async combined(pharmacyId: string, branchId: string | null) {
    const to = new Date();
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const reportWhere = this.reportWhere(pharmacyId, branchId, { from, to });
    const [reportSales, reportItems, chartSales, weeklyItems, categoryItems] =
      await Promise.all([
        this.prisma.sales.findMany({
          where: reportWhere,
          select: {
            id: true,
            total_amount: true,
            created_at: true,
            customer_name: true,
            payment_method: true,
          },
          orderBy: { created_at: "asc" },
        }),
        this.prisma.sale_items.findMany({
          where: { sales: reportWhere },
          select: {
            medication_name: true,
            total_price: true,
            quantity: true,
          },
        }),
        this.prisma.sales.findMany({
          where: {
            pharmacy_id: pharmacyId,
            ...(branchId ? { branch_id: branchId } : {}),
            created_at: {
              gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000),
            },
          },
          select: { total_amount: true, created_at: true },
        }),
        this.prisma.sale_items.findMany({
          where: {
            sales: {
              pharmacy_id: pharmacyId,
              ...(branchId ? { branch_id: branchId } : {}),
              created_at: {
                gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
              },
            },
          },
          select: {
            total_price: true,
            sales: { select: { created_at: true } },
            inventory: {
              select: { medications: { select: { category: true } } },
            },
          },
        }),
        this.prisma.sale_items.findMany({
          where: {
            sales: {
              pharmacy_id: pharmacyId,
              ...(branchId ? { branch_id: branchId } : {}),
            },
          },
          select: {
            total_price: true,
            inventory: {
              select: { medications: { select: { category: true } } },
            },
          },
        }),
      ]);

    const monthlyData: Record<string, number> = {};
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    for (const sale of chartSales) {
      const month = months[
        new Date(
          sale.created_at?.toISOString() ?? new Date().toISOString(),
        ).getMonth()
      ]!;
      monthlyData[month] =
        (monthlyData[month] || 0) + this.decimal(sale.total_amount);
    }
    const salesChart = Object.entries(monthlyData).map(([month, revenue]) => ({
      month,
      revenue: Math.round(Number(revenue)),
    }));

    const weeklyData: Record<
      string,
      { prescription: number; otc: number }
    > = {};
    const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for (const item of weeklyItems) {
      if (!item.sales?.created_at) continue;
      const dayIndex = new Date(item.sales.created_at).getDay();
      const day = weekdays[dayIndex === 0 ? 6 : dayIndex - 1]!;
      weeklyData[day] ??= { prescription: 0, otc: 0 };
      if (item.inventory?.medications?.category === "prescription") {
        weeklyData[day].prescription += this.decimal(item.total_price);
      } else {
        weeklyData[day].otc += this.decimal(item.total_price);
      }
    }
    const weeklySales = weekdays.map((day) => ({
      day,
      prescription: Math.round(weeklyData[day]?.prescription ?? 0),
      otc: Math.round(weeklyData[day]?.otc ?? 0),
    }));

    const categoryTotals: Record<string, number> = {};
    for (const item of categoryItems) {
      const category = item.inventory?.medications?.category ?? "other";
      categoryTotals[category] =
        (categoryTotals[category] || 0) + this.decimal(item.total_price);
    }
    const categorySales = Object.entries(categoryTotals).map(
      ([category, sales]) => ({
        category,
        sales: Math.round(Number(sales)),
        fill: `var(--color-${category})`,
      }),
    );

    return {
      salesReport: this.buildSalesReport(
        reportSales,
        reportItems,
        branchId,
      ),
      salesChart,
      weeklySales,
      categorySales,
    };
  }

  private phoneVariants(query: string): string[] {
    const digits = query.replace(/\D/g, "");
    if (digits.length < 3) return [];
    const variants = new Set<string>([query.trim(), digits]);
    if (digits.startsWith("250")) {
      variants.add(`+${digits}`);
      variants.add(`0${digits.slice(3)}`);
    } else if (digits.startsWith("0")) {
      variants.add(`+250${digits.slice(1)}`);
      variants.add(digits.slice(1));
    } else {
      variants.add(`+250${digits}`);
      variants.add(`0${digits}`);
    }
    return [...variants].filter(Boolean);
  }

  private customerIndex(
    customers: Array<{ name: string; phone: string | null }>,
  ): RegisteredCustomerIndex {
    const index: RegisteredCustomerIndex = {
      byPhone: new Set(),
      byName: new Set(),
    };
    for (const customer of customers) {
      const name = customer.name?.trim();
      if (name) index.byName.add(name.toLowerCase());
      const phone = customer.phone?.trim();
      if (phone) {
        index.byPhone.add(phone);
        for (const variant of this.phoneVariants(phone)) {
          index.byPhone.add(variant.trim());
        }
      }
    }
    return index;
  }

  private isRegistered(
    index: RegisteredCustomerIndex,
    name: string | null,
    phone: string | null,
  ): boolean {
    const trimmedPhone = phone?.trim();
    if (trimmedPhone) {
      if (index.byPhone.has(trimmedPhone)) return true;
      for (const variant of this.phoneVariants(trimmedPhone)) {
        if (index.byPhone.has(variant.trim())) return true;
      }
    }
    const trimmedName = name?.trim();
    const walkInLabels = new Set([
      "walk-in customer", "walk-in", "walk in customer",
      "walk in", "walkin", "walkin customer",
    ]);
    if (
      trimmedName &&
      !walkInLabels.has(trimmedName.toLowerCase()) &&
      index.byName.has(trimmedName.toLowerCase())
    ) {
      return true;
    }
    return false;
  }

  async payments(pharmacyId: string) {
    const sales = await this.prisma.sales.findMany({
      where: { pharmacy_id: pharmacyId },
      select: {
        id: true,
        total_amount: true,
        payment_method: true,
        status: true,
        created_at: true,
      },
      orderBy: { created_at: "desc" },
      take: 50,
    });
    return sales.map((s) => ({
      id: s.id,
      amount: Number(s.total_amount ?? 0),
      method: s.payment_method,
      status: s.status === "completed" ? "completed" : "pending",
      date: s.created_at?.toISOString() ?? null,
    }));
  }

  async analytics(pharmacyId: string) {
    const now = Date.now();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weeklyData = await this.prisma.sales.findMany({
      where: { pharmacy_id: pharmacyId, created_at: { gte: weekAgo } },
      select: { total_amount: true, created_at: true },
    });
    const dailyTotals: Record<string, number> = {};
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (const sale of weeklyData) {
      if (!sale.created_at) continue;
      const day = days[new Date(sale.created_at).getDay()]!;
      dailyTotals[day] =
        (dailyTotals[day] || 0) + this.decimal(sale.total_amount);
    }
    const weeklySales = days.map((day) => ({
      day,
      sales: Math.round(dailyTotals[day] || 0),
    }));

    const paymentData = await this.prisma.sales.findMany({
      where: { pharmacy_id: pharmacyId, created_at: { gte: monthAgo } },
      select: { payment_method: true, total_amount: true },
    });
    const paymentTotals: Record<string, number> = {};
    let totalAmount = 0;
    for (const sale of paymentData) {
      const method = sale.payment_method ?? "unknown";
      const amount = this.decimal(sale.total_amount);
      paymentTotals[method] = (paymentTotals[method] || 0) + amount;
      totalAmount += amount;
    }
    const paymentBreakdown = Object.entries(paymentTotals).map(
      ([method, amount]) => ({
        method,
        percentage: Math.round((Number(amount) / totalAmount) * 100) || 0,
      }),
    );

    const todayData = await this.prisma.sales.findMany({
      where: { pharmacy_id: pharmacyId, created_at: { gte: todayStart } },
      select: { total_amount: true, created_at: true },
    });
    const hourlyTotals: Record<number, number> = {};
    for (const sale of todayData) {
      if (!sale.created_at) continue;
      const hour = new Date(sale.created_at).getHours();
      hourlyTotals[hour] =
        (hourlyTotals[hour] || 0) + this.decimal(sale.total_amount);
    }
    const hourlySales: Array<{ hour: string; sales: number }> = [];
    const currentHour = new Date().getHours();
    for (let index = 7; index >= 0; index -= 1) {
      const hour = currentHour - index;
      const adjustedHour = hour < 0 ? hour + 24 : hour;
      const label =
        adjustedHour === 0
          ? "12AM"
          : adjustedHour < 12
            ? `${adjustedHour}AM`
            : adjustedHour === 12
              ? "12PM"
              : `${adjustedHour - 12}PM`;
      hourlySales.push({
        hour: label,
        sales: Math.round(hourlyTotals[adjustedHour] || 0),
      });
    }

    const currentMonth = new Date();
    const previousMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() - 1,
      1,
    );
    const currentMonthStart = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      1,
    );
    const [currentMonthData, previousMonthData] = await Promise.all([
      this.prisma.sales.findMany({
        where: {
          pharmacy_id: pharmacyId,
          created_at: { gte: currentMonthStart },
        },
        select: { total_amount: true, created_at: true },
      }),
      this.prisma.sales.findMany({
        where: {
          pharmacy_id: pharmacyId,
          created_at: { gte: previousMonth, lt: currentMonthStart },
        },
        select: { total_amount: true, created_at: true },
      }),
    ]);
    const currentWeeks: Record<number, number> = {};
    const previousWeeks: Record<number, number> = {};
    for (const sale of currentMonthData) {
      if (!sale.created_at) continue;
      const week = Math.ceil(new Date(sale.created_at).getDate() / 7);
      currentWeeks[week] =
        (currentWeeks[week] || 0) + this.decimal(sale.total_amount);
    }
    for (const sale of previousMonthData) {
      if (!sale.created_at) continue;
      const week = Math.ceil(new Date(sale.created_at).getDate() / 7);
      previousWeeks[week] =
        (previousWeeks[week] || 0) + this.decimal(sale.total_amount);
    }
    const monthlyComparison = [1, 2, 3, 4].map((week) => ({
      week: `Week ${week}`,
      current: Math.round(currentWeeks[week] || 0),
      previous: Math.round(previousWeeks[week] || 0),
    }));

    const categoryData = await this.prisma.sale_items.findMany({
      where: {
        sales: { pharmacy_id: pharmacyId, created_at: { gte: monthAgo } },
      },
      select: {
        total_price: true,
        inventory: {
          select: { medications: { select: { category: true } } },
        },
      },
    });
    const categoryTotals: Record<string, number> = {};
    let totalCategoryAmount = 0;
    for (const item of categoryData) {
      const category = item.inventory?.medications?.category || "other";
      const amount = this.decimal(item.total_price);
      categoryTotals[category] = (categoryTotals[category] || 0) + amount;
      totalCategoryAmount += amount;
    }
    const topCategories = Object.entries(categoryTotals)
      .map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value:
          Math.round((Number(value) / totalCategoryAmount) * 100) || 0,
        color:
          name === "prescription"
            ? "bg-red-500"
            : name === "otc"
              ? "bg-green-500"
              : name === "supplement"
                ? "bg-blue-500"
                : "bg-yellow-500",
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);

    const [allSales, registeredCustomers] = await Promise.all([
      this.prisma.sales.findMany({
        where: { pharmacy_id: pharmacyId, created_at: { gte: monthAgo } },
        select: {
          customer_id: true,
          customer_name: true,
          customer_phone: true,
          insurance_provider_id: true,
        },
      }),
      this.prisma.customers.findMany({
        where: { pharmacy_id: pharmacyId, is_active: { not: false } },
        select: { name: true, phone: true },
      }),
    ]);
    const index = this.customerIndex(registeredCustomers);
    let walkIn = 0;
    let regular = 0;
    let insurance = 0;
    for (const sale of allSales) {
      if (sale.insurance_provider_id) insurance += 1;
      else if (
        sale.customer_id ||
        this.isRegistered(
          index,
          sale.customer_name,
          sale.customer_phone,
        )
      ) {
        regular += 1;
      } else {
        walkIn += 1;
      }
    }
    const total = walkIn + regular + insurance;
    const customerDistribution =
      total > 0
        ? [
            {
              name: "Walk-in",
              value: Math.round((walkIn / total) * 100),
              fill: "#8fb3cc",
            },
            {
              name: "Regular",
              value: Math.round((regular / total) * 100),
              fill: "#003459",
            },
            {
              name: "Insurance",
              value: Math.round((insurance / total) * 100),
              fill: "#2d6a8f",
            },
          ]
        : [];
    return {
      weeklySales,
      paymentBreakdown,
      hourlySales,
      monthlyComparison,
      customerDistribution,
      topCategories,
    };
  }
}
