import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { CustomerRow, PrismaCustomerRow } from "./models";

export type { CustomerRow } from "./models";

export function parseAllergies(value?: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function mapCustomer(row: PrismaCustomerRow): CustomerRow {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    date_of_birth: row.date_of_birth?.toISOString().slice(0, 10) ?? null,
    allergies: row.allergies,
    insurance_number: row.insurance_number,
    is_active: row.is_active,
    created_at: row.created_at?.toISOString() ?? null,
  };
}

export function formattedCustomer(row: CustomerRow, totalPurchases = 0) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? "",
    email: row.email ?? "",
    dateOfBirth: row.date_of_birth ?? "",
    allergies: row.allergies.length ? row.allergies.join(", ") : "None",
    insurance: row.insurance_number ?? "",
    insurance_number: row.insurance_number ?? null,
    totalPurchases,
    lastVisit: row.created_at?.split("T")[0] ?? "",
    status: row.is_active === false ? ("inactive" as const) : ("active" as const),
  };
}

export function combinedCustomer(row: CustomerRow) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? "",
    email: row.email ?? undefined,
    dateOfBirth: row.date_of_birth ?? undefined,
    allergies: row.allergies?.join(", ") ?? undefined,
    insurance: row.insurance_number ?? undefined,
    insurance_number: row.insurance_number ?? undefined,
    status: row.is_active !== false ? "active" : "inactive",
  };
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(pharmacyId: string): Promise<CustomerRow[]> {
    const rows = await this.prisma.customers.findMany({
      where: { pharmacy_id: pharmacyId },
      orderBy: { created_at: "desc" },
    });
    return rows.map(mapCustomer);
  }

  async find(pharmacyId: string, customerId: string) {
    const row = await this.prisma.customers.findFirst({
      where: { id: customerId, pharmacy_id: pharmacyId },
    });
    return row ? mapCustomer(row) : null;
  }

  async create(input: {
    pharmacyId: string;
    name: string;
    phone?: string;
    email?: string;
    dateOfBirth?: string | null;
    allergies?: string[];
    insuranceNumber?: string;
  }) {
    return mapCustomer(
      await this.prisma.customers.create({
        data: {
          pharmacy_id: input.pharmacyId,
          name: input.name,
          phone: input.phone || null,
          email: input.email || null,
          date_of_birth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
          allergies: input.allergies ?? [],
          insurance_number: input.insuranceNumber || null,
          is_active: true,
        },
      }),
    );
  }

  async update(
    pharmacyId: string,
    customerId: string,
    updates: {
      name?: string;
      phone?: string;
      email?: string | null;
      dateOfBirth?: string | null;
      allergies?: string[];
      insuranceNumber?: string | null;
      isActive?: boolean;
    },
  ) {
    if (!(await this.find(pharmacyId, customerId))) return null;
    const row = await this.prisma.customers.update({
      where: { id: customerId },
      data: {
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
        ...(updates.email !== undefined ? { email: updates.email } : {}),
        ...(updates.dateOfBirth !== undefined
          ? { date_of_birth: updates.dateOfBirth ? new Date(updates.dateOfBirth) : null }
          : {}),
        ...(updates.allergies !== undefined ? { allergies: updates.allergies } : {}),
        ...(updates.insuranceNumber !== undefined
          ? { insurance_number: updates.insuranceNumber }
          : {}),
        ...(updates.isActive !== undefined ? { is_active: updates.isActive } : {}),
        updated_at: new Date(),
      },
    });
    return mapCustomer(row);
  }

  async totals(pharmacyId: string) {
    const sales = await this.prisma.sales.findMany({
      where: { pharmacy_id: pharmacyId },
      select: { total_amount: true, customer_phone: true, customer_name: true },
    });
    const byPhone = new Map<string, number>();
    const byName = new Map<string, number>();
    for (const sale of sales) {
      const amount = Number(sale.total_amount ?? 0);
      const phone = sale.customer_phone?.trim();
      if (phone) byPhone.set(phone, (byPhone.get(phone) ?? 0) + amount);
      const name = sale.customer_name?.trim().toLowerCase();
      if (name) byName.set(name, (byName.get(name) ?? 0) + amount);
    }
    return { byPhone, byName };
  }

  lookupTotal(
    index: Awaited<ReturnType<CustomersService["totals"]>>,
    name: string,
    phone?: string | null,
  ) {
    const normalizedPhone = phone?.trim();
    if (normalizedPhone) {
      const value = index.byPhone.get(normalizedPhone);
      if (value !== undefined) return value;
    }
    return index.byName.get(name.trim().toLowerCase()) ?? 0;
  }

  async recentSales(
    pharmacyId: string,
    name: string,
    phone: string | null,
    limit = 20,
  ) {
    const rows = await this.prisma.sales.findMany({
      where: {
        pharmacy_id: pharmacyId,
        ...(phone?.trim()
          ? { customer_phone: phone.trim() }
          : { customer_name: name }),
      },
      orderBy: { created_at: "desc" },
      take: limit,
      select: {
        id: true,
        total_amount: true,
        customer_name: true,
        customer_phone: true,
        created_at: true,
        receipt_number: true,
        payment_method: true,
      },
    });
    return rows.map((sale) => ({
      id: sale.id,
      receiptNumber: sale.receipt_number,
      totalAmount: Number(sale.total_amount ?? 0),
      paymentMethod: sale.payment_method,
      createdAt: sale.created_at?.toISOString() ?? null,
    }));
  }

  async search(pharmacyId: string, query: string) {
    const digits = query.replace(/\D/g, "");
    const variants = new Set<string>([query]);
    if (digits.length >= 3) {
      variants.add(digits);
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
    }
    return this.prisma.customers.findMany({
      where: {
        pharmacy_id: pharmacyId,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          { insurance_number: { contains: query, mode: "insensitive" } },
          ...[...variants].map((variant) => ({
            phone: { contains: variant, mode: "insensitive" as const },
          })),
        ],
      },
      take: 5,
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, insurance_number: true },
    });
  }
}
