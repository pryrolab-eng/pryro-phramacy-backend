import { HttpException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import {
  computeDaysToExpiry,
  readNumber,
  readString,
  serializeShift,
  type CoverageLineResult,
  type ShiftRow,
} from "./models/pos.types";

@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async requireFeature(
    userId: string,
    feature: string,
    requestedBranchId?: string | null,
  ): Promise<{ pharmacyId: string; branchId: string | null }> {
    const scope = await this.tenant.resolveRequestBranchScope(
      userId,
      requestedBranchId,
    );
    await this.entitlements.assertEntitlement({
      pharmacyId: scope.pharmacyId,
      feature,
    });
    return { pharmacyId: scope.pharmacyId, branchId: scope.branchId };
  }

  async recentSales(pharmacyId: string, branchId?: string) {
    const rows = await this.prisma.sales.findMany({
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
    });
    return rows.map((row) => ({
      id: row.id,
      customer: row.customer_name || "Walk-in Customer",
      amount: Number(row.total_amount),
      items: row.sale_items.length || 1,
      time: row.created_at
        ? new Date(row.created_at).toLocaleTimeString("en-US", {
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
    }));
  }

  async listProducts(pharmacyId: string, branchId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rows = await this.prisma.inventory.findMany({
      where: {
        pharmacy_id: pharmacyId,
        branch_id: branchId,
        quantity_in_stock: { gt: 0 },
        OR: [{ expiry_date: null }, { expiry_date: { gte: today } }],
      },
      select: {
        id: true,
        medication_id: true,
        batch_number: true,
        quantity_in_stock: true,
        selling_price: true,
        expiry_date: true,
        medications: {
          select: {
            id: true,
            name: true,
            category: true,
            generic_name: true,
            strength: true,
            dosage_form: true,
            barcode: true,
            requires_prescription: true,
            categories: { select: { name: true } },
            global_categories: { select: { name: true } },
          },
        },
      },
    });
    return rows
      .map((row) => {
        const expiryDate = row.expiry_date?.toISOString().slice(0, 10) ?? null;
        const daysToExpiry = computeDaysToExpiry(expiryDate);
        return {
          id: row.id,
          medicationId: row.medications?.id ?? row.medication_id ?? row.id,
          name: row.medications?.name ?? "Unknown Product",
          price: Number(row.selling_price ?? 0),
          stock: row.quantity_in_stock ?? 0,
          batch: row.batch_number ?? "—",
          expiryDate,
          daysToExpiry,
          requiresPrescription: Boolean(
            row.medications?.requires_prescription,
          ),
          strength: row.medications?.strength ?? null,
          dosageForm: row.medications?.dosage_form ?? null,
          genericName: row.medications?.generic_name ?? null,
          barcode: row.medications?.barcode ?? null,
          category:
            row.medications?.categories?.name ??
            row.medications?.global_categories?.name ??
            row.medications?.category ??
            "general",
        };
      })
      .filter((row) => row.stock > 0 && row.daysToExpiry >= 0)
      .sort((left, right) => left.daysToExpiry - right.daysToExpiry);
  }

  async priceCheck(pharmacyId: string, branchId: string | null, query: string) {
    if (!query.trim()) return [];
    const rows = await this.prisma.inventory.findMany({
      where: {
        pharmacy_id: pharmacyId,
        ...(branchId ? { branch_id: branchId } : {}),
        quantity_in_stock: { gt: 0 },
        OR: [
          {
            medications: {
              name: { contains: query.trim(), mode: "insensitive" },
            },
          },
          {
            medications: {
              barcode: { contains: query.trim(), mode: "insensitive" },
            },
          },
          {
            batch_number: {
              contains: query.trim(),
              mode: "insensitive",
            },
          },
        ],
      },
      take: 20,
      select: {
        quantity_in_stock: true,
        selling_price: true,
        medications: { select: { name: true, barcode: true } },
      },
    });
    return rows.map((row) => ({
      name: row.medications?.name ?? "Unknown",
      price: Number(row.selling_price ?? 0),
      stock: row.quantity_in_stock ?? 0,
      barcode: row.medications?.barcode ?? null,
    }));
  }

  async customerLookup(pharmacyId: string, phone: string) {
    if (!phone.trim()) return [];
    const [customers, sales] = await Promise.all([
      this.prisma.customers.findMany({
        where: {
          pharmacy_id: pharmacyId,
          phone: { contains: phone.trim(), mode: "insensitive" },
          is_active: { not: false },
        },
        take: 5,
        select: { id: true, name: true, phone: true },
      }),
      this.prisma.sales.findMany({
        where: {
          pharmacy_id: pharmacyId,
          customer_phone: { contains: phone.trim(), mode: "insensitive" },
        },
        select: {
          customer_name: true,
          customer_phone: true,
          total_amount: true,
          created_at: true,
        },
        orderBy: { created_at: "desc" },
        take: 50,
      }),
    ]);
    const byPhone = new Map<
      string,
      {
        id: string | null;
        name: string;
        phone: string;
        lastPurchase: string | null;
        totalSpent: number;
      }
    >();
    for (const customer of customers) {
      const key = customer.phone?.trim() ?? "";
      if (key) {
        byPhone.set(key, {
          id: customer.id,
          name: customer.name,
          phone: key,
          lastPurchase: null,
          totalSpent: 0,
        });
      }
    }
    for (const sale of sales) {
      const key = sale.customer_phone?.trim() ?? "";
      if (!key) continue;
      const current = byPhone.get(key) ?? {
        id: null,
        name: sale.customer_name ?? "Walk-in",
        phone: key,
        lastPurchase: null,
        totalSpent: 0,
      };
      current.totalSpent += Number(sale.total_amount ?? 0);
      current.lastPurchase ??= sale.created_at?.toISOString().slice(0, 10) ?? null;
      byPhone.set(key, current);
    }
    return Array.from(byPhone.values()).slice(0, 5);
  }

  async lookupSale(input: {
    pharmacyId: string;
    saleId?: string;
    receipt?: string;
    branchId?: string;
  }) {
    const sale = await this.prisma.sales.findFirst({
      where: {
        pharmacy_id: input.pharmacyId,
        status: "completed",
        ...(input.saleId ? { id: input.saleId } : {}),
        ...(input.receipt
          ? {
              receipt_number: {
                equals: input.receipt,
                mode: "insensitive",
              },
            }
          : {}),
        ...(input.branchId ? { branch_id: input.branchId } : {}),
      },
      include: {
        sale_items: {
          select: {
            id: true,
            inventory_id: true,
            medication_name: true,
            quantity: true,
            unit_price: true,
            batch_number: true,
            expiry_date: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });
    if (!sale) return null;
    const returnRows = await this.prisma.return_items.findMany({
      where: { returns: { sale_id: sale.id } },
      select: { sale_item_id: true, quantity: true },
    });
    const returned: Record<string, number> = {};
    for (const row of returnRows) {
      if (row.sale_item_id) {
        returned[row.sale_item_id] =
          (returned[row.sale_item_id] ?? 0) + (row.quantity ?? 0);
      }
    }
    return {
      sale: {
        id: sale.id,
        receiptNumber: sale.receipt_number,
        customerName: sale.customer_name,
        customerPhone: sale.customer_phone,
        totalAmount: sale.total_amount,
        paymentMethod: sale.payment_method,
        branchId: sale.branch_id,
        createdAt: sale.created_at,
        items: sale.sale_items.map((item) => ({
          saleItemId: item.id,
          inventoryId: item.inventory_id,
          name: item.medication_name,
          quantitySold: item.quantity,
          quantityReturned: returned[item.id] ?? 0,
          quantityAvailable: item.quantity - (returned[item.id] ?? 0),
          unitPrice: item.unit_price,
          batch: item.batch_number,
          expiryDate: item.expiry_date?.toISOString().slice(0, 10) ?? null,
        })),
      },
    };
  }

  async listDiscounts(pharmacyId: string) {
    const rows = await this.prisma.discounts.findMany({
      where: { pharmacy_id: pharmacyId, is_active: true },
      orderBy: { created_at: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      value: Number(row.value),
      active: row.is_active,
    }));
  }

  createDiscount(pharmacyId: string, body: Record<string, unknown>) {
    return this.prisma.discounts.create({
      data: {
        pharmacy_id:
          (typeof body.pharmacy_id === "string" && body.pharmacy_id) ||
          pharmacyId,
        name: String(body.name ?? ""),
        type: String(body.type ?? ""),
        value: Number(body.value) || 0,
        is_active: true,
      },
    });
  }

  createHeldSale(input: {
    pharmacyId: string;
    branchId: string;
    cashierId: string;
    customer: unknown;
    cart: unknown[];
  }) {
    return this.prisma.held_sales.create({
      data: {
        pharmacy_id: input.pharmacyId,
        branch_id: input.branchId,
        cashier_id: input.cashierId,
        customer: input.customer as Prisma.InputJsonValue,
        cart: input.cart as Prisma.InputJsonValue,
      },
    });
  }

  async listHeldSales(input: {
    pharmacyId: string;
    branchId?: string;
    cashierId: string;
  }) {
    const rows = await this.prisma.held_sales.findMany({
      where: {
        pharmacy_id: input.pharmacyId,
        ...(input.branchId ? { branch_id: input.branchId } : {}),
        cashier_id: input.cashierId,
      },
      orderBy: { created_at: "desc" },
      take: 20,
    });
    return rows.map((row) => {
      const cart = Array.isArray(row.cart) ? row.cart : [];
      return {
        id: row.id,
        customer: row.customer ?? null,
        items: cart.length,
        cart,
        timestamp: row.created_at,
      };
    });
  }

  private mapShift(row: {
    id: string;
    pharmacy_id: string;
    branch_id: string;
    cashier_id: string;
    status: string;
    opening_cash: unknown;
    expected_cash: unknown;
    actual_cash: unknown;
    cash_variance: unknown;
    total_sales: unknown;
    total_refunds: unknown;
    transaction_count: number | null;
    opened_at: Date;
    closed_at: Date | null;
    close_notes: string | null;
    created_at: Date | null;
    updated_at: Date | null;
  }): ShiftRow {
    const nullableNumber = (value: unknown) =>
      value == null ? null : Number(value);
    return {
      ...row,
      opening_cash: Number(row.opening_cash),
      expected_cash: nullableNumber(row.expected_cash),
      actual_cash: nullableNumber(row.actual_cash),
      cash_variance: nullableNumber(row.cash_variance),
      total_sales: nullableNumber(row.total_sales),
      total_refunds: nullableNumber(row.total_refunds),
    };
  }

  async summarizeShiftSales(input: {
    pharmacyId: string;
    branchId: string;
    cashierId: string;
    openedAt: Date;
  }) {
    // Use aggregate instead of findMany to avoid fetching all rows
    const [aggregate, cashAggregate, count] = await Promise.all([
      this.prisma.sales.aggregate({
        where: {
          pharmacy_id: input.pharmacyId,
          branch_id: input.branchId,
          cashier_id: input.cashierId,
          status: "completed",
          created_at: { gte: input.openedAt },
        },
        _sum: { customer_amount: true, total_amount: true },
        _count: { id: true },
      }),
      this.prisma.sales.aggregate({
        where: {
          pharmacy_id: input.pharmacyId,
          branch_id: input.branchId,
          cashier_id: input.cashierId,
          status: "completed",
          payment_method: "cash",
          created_at: { gte: input.openedAt },
        },
        _sum: { customer_amount: true, total_amount: true },
      }),
      // count is included in the first aggregate
      Promise.resolve(null),
    ]);

    const totalSales = Number(aggregate._sum.customer_amount ?? aggregate._sum.total_amount ?? 0);
    const cashSales = Number(cashAggregate._sum.customer_amount ?? cashAggregate._sum.total_amount ?? 0);
    const transactionCount = aggregate._count.id;

    return { totalSales, cashSales, transactionCount };
  }

  async getShift(input: {
    pharmacyId: string;
    branchId: string;
    cashierId: string;
  }) {
    const row = await this.prisma.cashier_shifts.findFirst({
      where: {
        pharmacy_id: input.pharmacyId,
        branch_id: input.branchId,
        cashier_id: input.cashierId,
        status: "open",
      },
    });
    if (!row) return { shift: null };
    const shift = this.mapShift(row);
    const summary = await this.summarizeShiftSales({
      ...input,
      openedAt: row.opened_at,
    });
    return {
      shift: {
        ...serializeShift(shift),
        liveTotalSales: summary.totalSales,
        liveCashSales: summary.cashSales,
        liveTransactionCount: summary.transactionCount,
        expectedCash: shift.opening_cash + summary.cashSales,
      },
    };
  }

  async getTeamShifts(input: {
    pharmacyId: string;
    branchId: string;
    currentUserId: string;
  }) {
    const membership = await this.prisma.pharmacy_users.findFirst({
      where: {
        user_id: input.currentUserId,
        pharmacy_id: input.pharmacyId,
        is_active: true,
      },
      select: { role: true },
    });
    if (
      !membership ||
      !["pharmacy_owner", "admin"].includes(String(membership.role))
    ) {
      throw new HttpException({ error: "Forbidden" }, 403);
    }
    const shifts = await this.prisma.cashier_shifts.findMany({
      where: {
        pharmacy_id: input.pharmacyId,
        branch_id: input.branchId,
        status: "open",
      },
      orderBy: { opened_at: "asc" },
    });
    const profiles = await this.prisma.public_users.findMany({
      where: { id: { in: shifts.map((row) => row.cashier_id) } },
      select: { id: true, full_name: true, name: true, email: true },
    });
    const names = new Map(
      profiles.map((row) => [
        row.id,
        row.full_name ||
          row.name ||
          row.email?.split("@")[0] ||
          "Staff",
      ]),
    );
    return {
      team: await Promise.all(
        shifts.map(async (row) => {
          const summary = await this.summarizeShiftSales({
            pharmacyId: input.pharmacyId,
            branchId: input.branchId,
            cashierId: row.cashier_id,
            openedAt: row.opened_at,
          });
          return {
            id: row.id,
            cashierId: row.cashier_id,
            cashierName: names.get(row.cashier_id) ?? "Staff",
            openedAt: row.opened_at,
            openingCash: Number(row.opening_cash),
            isCurrentUser: row.cashier_id === input.currentUserId,
            liveTotalSales: summary.totalSales,
            liveTransactionCount: summary.transactionCount,
          };
        }),
      ),
    };
  }

  async openShift(input: {
    pharmacyId: string;
    branchId: string;
    cashierId: string;
    openingCash: number;
  }) {
    const existing = await this.prisma.cashier_shifts.findFirst({
      where: {
        branch_id: input.branchId,
        cashier_id: input.cashierId,
        status: "open",
      },
    });
    if (existing) {
      throw new HttpException(
        { error: "You already have an open shift for this branch" },
        400,
      );
    }
    const row = await this.prisma.cashier_shifts.create({
      data: {
        pharmacy_id: input.pharmacyId,
        branch_id: input.branchId,
        cashier_id: input.cashierId,
        opening_cash: input.openingCash,
        status: "open",
      },
    });
    return serializeShift(this.mapShift(row));
  }

  async closeShift(input: {
    shiftId: string;
    cashierId: string;
    pharmacyId: string;
    branchId: string;
    actualCash: number;
    closeNotes: string | null;
  }) {
    const row = await this.prisma.cashier_shifts.findFirst({
      where: {
        id: input.shiftId,
        cashier_id: input.cashierId,
        status: "open",
      },
    });
    if (!row) throw new Error("Open shift not found");
    const shift = this.mapShift(row);
    const sales = await this.summarizeShiftSales({
      pharmacyId: input.pharmacyId,
      branchId: input.branchId,
      cashierId: input.cashierId,
      openedAt: row.opened_at,
    });
    const expectedCash = shift.opening_cash + sales.cashSales;
    const variance = input.actualCash - expectedCash;
    const closed = await this.prisma.cashier_shifts.update({
      where: { id: row.id },
      data: {
        status: "closed",
        closed_at: new Date(),
        expected_cash: expectedCash,
        actual_cash: input.actualCash,
        cash_variance: variance,
        total_sales: sales.totalSales,
        transaction_count: sales.transactionCount,
        close_notes: input.closeNotes,
      },
    });
    return {
      shift: serializeShift(this.mapShift(closed)),
      summary: {
        ...sales,
        expectedCash,
        actualCash: input.actualCash,
        variance,
        totalRefunds: shift.total_refunds ?? 0,
      },
    };
  }

  createCategory(
    pharmacyId: string,
    body: Record<string, unknown>,
  ) {
    return this.prisma.categories.create({
      data: {
        pharmacy_id: pharmacyId,
        name: readString(body, "categoryName", "name"),
        description:
          readString(body, "categoryDescription", "description") || "",
        is_active: true,
      },
    });
  }

  createPatient(pharmacyId: string, body: Record<string, unknown>) {
    return this.prisma.customers.create({
      data: {
        pharmacy_id: pharmacyId,
        name: readString(body, "patientName", "name"),
        phone: readString(body, "phoneNumber", "phone") || null,
        insurance_number: readString(body, "insuranceNumber") || null,
        allergies: [],
        medical_conditions: [],
        is_active: true,
      },
    });
  }

  createInsurance(pharmacyId: string, body: Record<string, unknown>) {
    const coverage = readNumber(body, "coveragePercentage");
    return this.prisma.insurance_providers.create({
      data: {
        pharmacy_id: pharmacyId,
        name: readString(body, "insuranceName"),
        coverage_percentage: coverage,
        default_coverage_percent: coverage,
        is_active: true,
      },
    });
  }

  async quickAddDrug(input: {
    pharmacyId: string;
    branchId: string;
    body: Record<string, unknown>;
  }) {
    const name = readString(input.body, "productName", "name");
    const categoryName = readString(input.body, "category");
    let category = await this.prisma.categories.findFirst({
      where: {
        OR: [
          { pharmacy_id: input.pharmacyId },
          { pharmacy_id: null },
        ],
        name: { equals: categoryName, mode: "insensitive" },
      },
      select: { id: true, name: true },
    });
    category ??= await this.prisma.categories.create({
      data: {
        pharmacy_id: input.pharmacyId,
        name: categoryName,
        is_active: true,
      },
      select: { id: true, name: true },
    });
    const medication = await this.prisma.medications.create({
      data: {
        pharmacy_id: input.pharmacyId,
        name,
        category_id: category.id,
        manufacturer: readString(input.body, "manufacturer") || null,
        barcode: readString(input.body, "barcode") || null,
        requires_prescription: false,
        is_active: true,
      },
    });
    const inventory = await this.prisma.inventory.create({
      data: {
        pharmacy_id: input.pharmacyId,
        branch_id: input.branchId,
        medication_id: medication.id,
        batch_number:
          readString(input.body, "batchNumber", "batch_number") || "BATCH001",
        quantity_in_stock: readNumber(
          input.body,
          "initialStock",
          "initial_stock",
        ),
        unit_cost: readNumber(
          input.body,
          "purchasePrice",
          "purchase_price",
        ),
        selling_price: readNumber(input.body, "unitPrice", "unit_price"),
        minimum_stock_level: readNumber(
          input.body,
          "minStockAlert",
          "min_stock",
          "minimum_stock_level",
        ),
        expiry_date: readString(input.body, "expiryDate", "expiry_date")
          ? new Date(readString(input.body, "expiryDate", "expiry_date"))
          : null,
      },
    });
    return { medication, inventory };
  }

  private parseCoverage(raw: unknown) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as Record<
      string,
      {
        covered?: boolean;
        externalCode?: string;
        effectiveFrom?: string;
        effectiveTo?: string | null;
      }
    >;
  }

  async resolveProvider(pharmacyId: string, key: string) {
    if (!key.trim()) return null;
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        key,
      );
    return this.prisma.insurance_providers.findFirst({
      where: {
        is_active: true,
        OR: [{ pharmacy_id: pharmacyId }, { pharmacy_id: null }],
        ...(isUuid
          ? { id: key }
          : { name: { contains: key, mode: "insensitive" } }),
      },
      orderBy: { pharmacy_id: { sort: "desc", nulls: "last" } },
    });
  }

  async computeCoverage(input: {
    pharmacyId: string;
    providerKey: string;
    lines: Array<{
      inventoryId?: string;
      medicationId: string;
      medicationName?: string;
      quantity: number;
      shelfUnitPrice: number;
    }>;
  }): Promise<{
    providerId: string;
    subtotal: number;
    insuranceCoverage: number;
    patientCopay: number;
    lines: CoverageLineResult[];
  } | null> {
    const provider = await this.resolveProvider(
      input.pharmacyId,
      input.providerKey,
    );
    if (!provider) return null;
    const medications = await this.prisma.medications.findMany({
      where: {
        pharmacy_id: input.pharmacyId,
        id: { in: input.lines.map((line) => line.medicationId) },
      },
      select: { id: true, insurance_coverage: true },
    });
    const coverageByMedication = new Map(
      medications.map((row) => [
        row.id,
        this.parseCoverage(row.insurance_coverage),
      ]),
    );
    const percent = Number(
      provider.default_coverage_percent ??
        provider.coverage_percentage ??
        0,
    );
    const today = new Date().toISOString().slice(0, 10);
    const lines = input.lines.map((line): CoverageLineResult => {
      const total =
        Math.max(0, line.quantity) * Math.max(0, line.shelfUnitPrice);
      const entry = coverageByMedication.get(line.medicationId)?.[provider.id];
      const active =
        entry &&
        (!entry.effectiveFrom || today >= entry.effectiveFrom) &&
        (!entry.effectiveTo || today <= entry.effectiveTo);
      const covered = Boolean(active && entry?.covered === true);
      const insurerPays = covered ? Math.round(total * (percent / 100)) : 0;
      return {
        ...line,
        isCovered: covered,
        insuredUnitPrice: line.shelfUnitPrice,
        coveragePercent: covered ? percent : 0,
        insurerPays,
        patientPays: total - insurerPays,
        reason: covered
          ? "covered"
          : entry
            ? "not_covered"
            : "not_listed",
      };
    });
    const insuranceCoverage = lines.reduce(
      (sum, line) => sum + line.insurerPays,
      0,
    );
    const patientCopay = lines.reduce(
      (sum, line) => sum + line.patientPays,
      0,
    );
    return {
      providerId: provider.id,
      subtotal: insuranceCoverage + patientCopay,
      insuranceCoverage,
      patientCopay,
      lines,
    };
  }

  async buildInvoice(pharmacyId: string, body: Record<string, unknown>) {
    const pharmacy = await this.prisma.pharmacies.findUnique({
      where: { id: pharmacyId },
      select: { name: true, address: true, phone: true, rra_tin: true },
    });
    const insuranceType = String(body.insuranceType ?? "");
    const provider = await this.resolveProvider(pharmacyId, insuranceType);
    const coveragePercent = Number(
      provider?.default_coverage_percent ??
        provider?.coverage_percentage ??
        0,
    );
    const items = Array.isArray(body.items)
      ? (body.items as Array<Record<string, unknown>>)
      : [];
    let totalAmount = 0;
    let taxAmount = 0;
    const processedItems = await Promise.all(
      items.map(async (item) => {
        const name = String(item.name ?? "");
        const quantity = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        const medication = await this.prisma.medications.findFirst({
          where: {
            pharmacy_id: pharmacyId,
            name: { equals: name, mode: "insensitive" },
          },
          select: { id: true },
        });
        let insurancePrice = price;
        if (medication) {
          const inventory = await this.prisma.inventory.findFirst({
            where: {
              pharmacy_id: pharmacyId,
              medication_id: medication.id,
              quantity_in_stock: { gt: 0 },
            },
            select: { selling_price: true },
            orderBy: { created_at: "desc" },
          });
          insurancePrice = Number(inventory?.selling_price ?? price);
        }
        const total = quantity * insurancePrice;
        totalAmount += total;
        taxAmount += total * 0.18;
        const insuranceCoverage = (total * coveragePercent) / 100;
        return {
          ...item,
          insurancePrice,
          pharmacyPrice: price,
          total,
          insuranceCoverage,
          patientPortion: total - insuranceCoverage,
        };
      }),
    );
    const now = new Date();
    return {
      pharmacyName: pharmacy?.name || "Pharmacy",
      pharmacyAddress: pharmacy?.address || "",
      pharmacyPhone: pharmacy?.phone || "",
      pharmacyTIN: pharmacy?.rra_tin || "",
      insuranceName: provider?.name || insuranceType,
      insurancePercentage: coveragePercent,
      receiptNumber: `RCP-${Date.now()}`,
      date: now.toLocaleDateString("en-GB"),
      time: now.toLocaleTimeString("en-GB", { hour12: false }),
      sdcId: `SDC-${Date.now()}`,
      beneficialNumber: body.patientId,
      beneficialName: body.patientName || "Patient Name",
      relationship: body.relationship || "Self",
      telephone: body.patientPhone || "",
      affiliateName: body.affiliateName || body.patientName,
      dateOfBirth: body.dateOfBirth || "",
      dutyStation: body.dutyStation || "",
      insuranceTIN: body.insuranceTIN || "",
      doctorName: body.doctorName || "",
      mrcCode: body.mrcCode || "",
      items: processedItems,
      totalAmount,
      taxAmount,
      totalWithTax: totalAmount + taxAmount,
      insuranceAmount: (totalAmount * coveragePercent) / 100,
      patientAmount: (totalAmount * (100 - coveragePercent)) / 100,
      patientPercentage: 100 - coveragePercent,
    };
  }

  async dailyClose(input: {
    pharmacyId: string;
    branchId: string;
    userId: string;
  }) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const rows = await this.prisma.sales.findMany({
      where: {
        pharmacy_id: input.pharmacyId,
        branch_id: input.branchId,
        status: "completed",
        created_at: { gte: startOfDay, lte: endOfDay },
      },
      select: { total_amount: true, payment_method: true },
    });
    const totals = {
      cashAmount: 0,
      cardAmount: 0,
      mobileMoneyAmount: 0,
      insuranceAmount: 0,
      mixedAmount: 0,
      totalSales: 0,
    };
    for (const sale of rows) {
      const amount = Number(sale.total_amount);
      totals.totalSales += amount;
      if (sale.payment_method === "card") totals.cardAmount += amount;
      else if (sale.payment_method === "mobile_money") {
        totals.mobileMoneyAmount += amount;
      } else if (sale.payment_method === "insurance") {
        totals.insuranceAmount += amount;
      } else if (sale.payment_method === "mixed") {
        totals.mixedAmount += amount;
      } else totals.cashAmount += amount;
    }
    const dailyClose = {
      id: `${input.branchId}-${startOfDay.toISOString().slice(0, 10)}`,
      date: startOfDay.toISOString().slice(0, 10),
      branchId: input.branchId,
      ...totals,
      totalTransactions: rows.length,
      closedBy: input.userId,
      closedAt: new Date().toISOString(),
    };
    await this.prisma.daily_closes.upsert({
      where: {
        branch_id_close_date: {
          branch_id: input.branchId,
          close_date: startOfDay,
        },
      },
      update: {
        total_sales: totals.totalSales,
        total_transactions: rows.length,
        cash_amount: totals.cashAmount,
        card_amount: totals.cardAmount,
        mobile_money_amount: totals.mobileMoneyAmount,
        insurance_amount: totals.insuranceAmount,
        mixed_amount: totals.mixedAmount,
        closed_by: input.userId,
        closed_at: new Date(),
      },
      create: {
        pharmacy_id: input.pharmacyId,
        branch_id: input.branchId,
        close_date: startOfDay,
        total_sales: totals.totalSales,
        total_transactions: rows.length,
        cash_amount: totals.cashAmount,
        card_amount: totals.cardAmount,
        mobile_money_amount: totals.mobileMoneyAmount,
        insurance_amount: totals.insuranceAmount,
        mixed_amount: totals.mixedAmount,
        closed_by: input.userId,
      },
    });
    return dailyClose;
  }
}
