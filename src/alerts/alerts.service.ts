import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  private inventory(pharmacyId: string, branchId?: string) {
    return this.prisma.inventory.findMany({
      where: { pharmacy_id: pharmacyId, ...(branchId ? { branch_id: branchId } : {}) },
      select: {
        id: true,
        batch_number: true,
        quantity_in_stock: true,
        minimum_stock_level: true,
        expiry_date: true,
        medications: {
          select: {
            name: true,
            category: true,
            categories: { select: { name: true } },
            global_categories: { select: { name: true } },
          },
        },
      },
    });
  }

  async dashboard(pharmacyId: string) {
    const today = new Date();
    return (await this.inventory(pharmacyId))
      .filter(
        (row) =>
          (row.quantity_in_stock ?? 0) < (row.minimum_stock_level ?? 0) * 1.5,
      )
      .slice(0, 50)
      .map((row) => {
        const days = row.expiry_date
          ? Math.ceil((row.expiry_date.getTime() - today.getTime()) / 86_400_000)
          : 0;
        return {
          id: row.id,
          product: row.medications?.name ?? "Unknown Product",
          current_stock: row.quantity_in_stock ?? 0,
          min_stock: row.minimum_stock_level ?? 0,
          category:
            row.medications?.categories?.name ??
            row.medications?.global_categories?.name ??
            row.medications?.category ??
            "General",
          expires_in: days > 0 ? days : 0,
        };
      });
  }

  async stock(pharmacyId: string, branchId?: string) {
    const rows = await this.inventory(pharmacyId, branchId);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 30);
    const format = (row: (typeof rows)[number]) => ({
      id: row.id,
      name: row.medications?.name ?? "Unknown",
      category:
        row.medications?.categories?.name ??
        row.medications?.global_categories?.name ??
        row.medications?.category ??
        "other",
      batch: row.batch_number,
      quantity: row.quantity_in_stock,
      minimum: row.minimum_stock_level,
      expiry: row.expiry_date?.toISOString().slice(0, 10) ?? null,
    });
    return {
      all: rows.map(format),
      lowStock: rows
        .filter(
          (row) =>
            (row.quantity_in_stock ?? 0) <= (row.minimum_stock_level ?? 0),
        )
        .map(format),
      expiring: rows
        .filter((row) => row.expiry_date && row.expiry_date <= cutoff)
        .map(format),
    };
  }
}
