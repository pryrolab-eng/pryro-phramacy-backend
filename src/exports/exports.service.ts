import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type ExportRow = Record<string, unknown>;

function csvValue(value: unknown): string {
  if (value == null) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: ExportRow[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.map(csvValue).join(","),
    ...rows.map((row) => headers.map((key) => csvValue(row[key])).join(",")),
  ].join("\n");
}

function fileSafe(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");
}

@Injectable()
export class ExportsService {
  constructor(private readonly prisma: PrismaService) {}

  async loadRows(pharmacyId: string, type: string): Promise<ExportRow[]> {
    if (type === "customers") {
      return this.prisma.customers.findMany({
        where: { pharmacy_id: pharmacyId },
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          insurance_number: true,
          is_active: true,
          created_at: true,
        },
      });
    }

    if (type === "inventory") {
      const rows = await this.prisma.inventory.findMany({
        where: { pharmacy_id: pharmacyId },
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          batch_number: true,
          quantity_in_stock: true,
          minimum_stock_level: true,
          selling_price: true,
          expiry_date: true,
          medications: { select: { name: true, category: true } },
        },
      });

      return rows.map((row) => ({
        id: row.id,
        medication: row.medications?.name ?? "",
        category: row.medications?.category ?? "",
        batch_number: row.batch_number,
        quantity_in_stock: row.quantity_in_stock,
        minimum_stock_level: row.minimum_stock_level,
        selling_price: row.selling_price?.toString() ?? "",
        expiry_date: row.expiry_date,
      }));
    }

    const rows = await this.prisma.sales.findMany({
      where: { pharmacy_id: pharmacyId },
      orderBy: { created_at: "desc" },
      take: 5000,
      select: {
        id: true,
        receipt_number: true,
        customer_name: true,
        customer_phone: true,
        payment_method: true,
        total_amount: true,
        status: true,
        created_at: true,
      },
    });

    return rows.map((row) => ({
      ...row,
      total_amount: row.total_amount?.toString() ?? "0",
    }));
  }

  generateContent(rows: ExportRow[], format: string): string {
    return format === "json" ? JSON.stringify(rows, null, 2) : toCsv(rows);
  }
}
