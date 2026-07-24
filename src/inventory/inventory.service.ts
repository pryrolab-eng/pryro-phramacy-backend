import { Injectable } from "@nestjs/common";
import type { Prisma, medication_category } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  categoryEnum,
  categoryName,
  type InventoryRow,
  isMissingStockLocation,
  medicationSelect,
} from "./models";

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private mapRow(row: {
    id: string;
    pharmacy_id: string | null;
    branch_id: string | null;
    medication_id: string | null;
    stock_location_id?: string | null;
    batch_number: string;
    quantity_in_stock: number | null;
    selling_price: Prisma.Decimal | null;
    minimum_stock_level: number | null;
    expiry_date: Date | null;
    unit_cost: Prisma.Decimal | null;
    medications: {
      name: string;
      category: medication_category | null;
      pharmacy_id: string | null;
      categories: { name: string } | null;
      global_categories: { name: string } | null;
    } | null;
    stock_locations?: { id: string; name: string } | null;
  }): InventoryRow {
    return {
      id: row.id,
      pharmacy_id: row.pharmacy_id,
      branch_id: row.branch_id,
      medication_id: row.medication_id,
      stock_location_id: row.stock_location_id ?? null,
      batch_number: row.batch_number,
      quantity_in_stock: row.quantity_in_stock,
      selling_price: row.selling_price == null ? null : Number(row.selling_price),
      minimum_stock_level: row.minimum_stock_level,
      expiry_date: row.expiry_date,
      unit_cost: row.unit_cost == null ? null : Number(row.unit_cost),
      medications: row.medications
        ? {
            name: row.medications.name,
            category: categoryName(row.medications),
            pharmacy_id: row.medications.pharmacy_id,
          }
        : null,
      stock_locations: row.stock_locations ?? null,
    };
  }

  async rows(pharmacyId: string, branchId?: string | null, medicationScoped = true, page = 1, limit = 50) {
    const where = {
      pharmacy_id: pharmacyId,
      ...(branchId ? { branch_id: branchId } : {}),
      ...(medicationScoped ? { medications: { pharmacy_id: pharmacyId } } : {}),
    };
    const skip = (page - 1) * limit;
    try {
      const [rows, total] = await Promise.all([
        this.prisma.inventory.findMany({
          where,
          select: {
            id: true,
            pharmacy_id: true,
            branch_id: true,
            medication_id: true,
            stock_location_id: true,
            batch_number: true,
            quantity_in_stock: true,
            selling_price: true,
            minimum_stock_level: true,
            expiry_date: true,
            unit_cost: true,
            medications: { select: medicationSelect },
            stock_locations: { select: { id: true, name: true } },
          },
          skip,
          take: limit,
        }),
        this.prisma.inventory.count({ where }),
      ]);
      return { rows: rows.map((row) => this.mapRow(row)), total };
    } catch (error) {
      if (!isMissingStockLocation(error)) throw error;
      const [rows, total] = await Promise.all([
        this.prisma.inventory.findMany({
          where,
          select: {
            id: true,
            pharmacy_id: true,
            branch_id: true,
            medication_id: true,
            batch_number: true,
            quantity_in_stock: true,
            selling_price: true,
            minimum_stock_level: true,
            expiry_date: true,
            unit_cost: true,
            medications: { select: medicationSelect },
          },
          skip,
          take: limit,
        }),
        this.prisma.inventory.count({ where }),
      ]);
      return { rows: rows.map((row) => this.mapRow(row)), total };
    }
  }

  async list(pharmacyId: string, branchId?: string | null, page = 1, limit = 50) {
    const { rows, total } = await this.rows(pharmacyId, branchId, true, page, limit);
    return {
      rows: rows.map((row) => ({
        id: row.id,
        medicationId: row.medication_id ?? "",
        name: row.medications?.name ?? "Unknown",
        category: row.medications?.category ?? "general",
        stock: row.quantity_in_stock,
        minStock: row.minimum_stock_level,
        price: row.selling_price,
        expiryDate: row.expiry_date?.toISOString().slice(0, 10) ?? null,
        batchNumber: row.batch_number,
        stockLocationId: row.stock_location_id,
        stockLocationName: row.stock_locations?.name ?? null,
        medications: row.medications,
        pharmacy_id: row.pharmacy_id,
      })),
      total,
      page,
      limit,
    };
  }

  private alertItem(row: InventoryRow) {
    return {
      id: row.id,
      name: row.medications?.name ?? "Unknown",
      category: row.medications?.category ?? "other",
      batch: row.batch_number,
      quantity: row.quantity_in_stock,
      minimum: row.minimum_stock_level,
      expiry: row.expiry_date?.toISOString().slice(0, 10) ?? null,
    };
  }

  async stockAlerts(pharmacyId: string, branchId?: string | null) {
    const { rows } = await this.rows(pharmacyId, branchId, false);
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    return {
      all: rows.map((row) => this.alertItem(row)),
      lowStock: rows
        .filter((row) => (row.quantity_in_stock ?? 0) <= (row.minimum_stock_level ?? 0))
        .map((row) => this.alertItem(row)),
      expiring: rows
        .filter((row) => row.expiry_date && row.expiry_date <= thirtyDays)
        .map((row) => this.alertItem(row)),
    };
  }

  async expiryAlerts(pharmacyId: string, withinDays = 60) {
    const { rows } = await this.rows(pharmacyId, null, false);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + withinDays);
    return rows
      .filter((row) => row.expiry_date && row.expiry_date <= cutoff)
      .map((row) => {
        const expiry = row.expiry_date!;
        const daysUntilExpiry = Math.ceil(
          (expiry.getTime() - today.getTime()) / 86_400_000,
        );
        return {
          id: row.id,
          product: row.medications?.name ?? "Unknown",
          batchNumber: row.batch_number,
          expiryDate: expiry.toISOString().slice(0, 10),
          daysUntilExpiry,
          quantity: row.quantity_in_stock ?? 0,
          priority:
            daysUntilExpiry <= 30
              ? ("high" as const)
              : daysUntilExpiry <= 60
                ? ("medium" as const)
                : ("low" as const),
        };
      })
      .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  }

  private async stockLocation(pharmacyId: string, value?: unknown) {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return null;
    const rows = await this.prisma.stock_locations.findMany({
      where: { pharmacy_id: pharmacyId, is_active: true },
      select: { id: true, name: true },
      orderBy: { created_at: "asc" },
    });
    if (!rows.length) return null;
    const slug = (text: string) =>
      text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return (
      rows.find((row) => row.id === raw)?.id ??
      rows.find((row) => slug(row.name) === slug(raw))?.id ??
      rows[0]!.id
    );
  }

  async createInventory(input: {
    pharmacyId: string;
    branchId: string;
    medicationId: string;
    batchNumber?: string;
    quantity: number;
    unitCost?: number;
    sellingPrice?: number;
    minimumStockLevel?: number;
    expiryDate?: string;
    stockLocation?: unknown;
  }) {
    const stockLocationId = await this.stockLocation(input.pharmacyId, input.stockLocation);
    const data = {
      pharmacy_id: input.pharmacyId,
      branch_id: input.branchId,
      medication_id: input.medicationId,
      batch_number: input.batchNumber ?? "BATCH001",
      quantity_in_stock: input.quantity,
      unit_cost: input.unitCost ?? 0,
      selling_price: input.sellingPrice ?? 0,
      minimum_stock_level: input.minimumStockLevel ?? 0,
      expiry_date: new Date(input.expiryDate ?? "2030-12-31"),
      ...(stockLocationId ? { stock_location_id: stockLocationId } : {}),
    };
    try {
      return await this.prisma.inventory.create({ data });
    } catch (error) {
      if (!stockLocationId || !isMissingStockLocation(error)) throw error;
      const { stock_location_id: _ignored, ...fallback } = data;
      return this.prisma.inventory.create({ data: fallback });
    }
  }

  private async resolveCategory(pharmacyId: string, value: string) {
    const input = value.trim();
    if (!input) throw new Error("Category is required");
    if (input.startsWith("global:")) {
      const row = await this.prisma.global_categories.findFirst({
        where: { id: input.slice(7), is_active: { not: false } },
        select: { id: true, name: true },
      });
      if (!row) throw new Error("Global category not found");
      return { category_id: null, global_category_id: row.id, category: categoryEnum(row.name) };
    }
    if (input.startsWith("category:")) {
      const row = await this.prisma.categories.findFirst({
        where: {
          id: input.slice(9),
          is_active: { not: false },
          OR: [{ pharmacy_id: pharmacyId }, { pharmacy_id: null }],
        },
        select: { id: true, name: true },
      });
      if (!row) throw new Error("Category not found");
      return { category_id: row.id, global_category_id: null, category: categoryEnum(row.name) };
    }
    const [global, local] = await Promise.all([
      this.prisma.global_categories.findMany({
        where: { is_active: { not: false } },
        select: { id: true, name: true },
      }),
      this.prisma.categories.findMany({
        where: {
          is_active: { not: false },
          OR: [{ pharmacy_id: pharmacyId }, { pharmacy_id: null }],
        },
        select: { id: true, name: true, pharmacy_id: true },
      }),
    ]);
    const same = (name: string) =>
      name.localeCompare(input, undefined, { sensitivity: "accent" }) === 0;
    const globalMatch = global.find((row) => same(row.name));
    if (globalMatch) {
      return {
        category_id: null,
        global_category_id: globalMatch.id,
        category: categoryEnum(globalMatch.name),
      };
    }
    const localMatch = local.find((row) => same(row.name));
    if (localMatch) {
      return {
        category_id: localMatch.id,
        global_category_id: null,
        category: categoryEnum(localMatch.name),
      };
    }
    const created = await this.prisma.categories.create({
      data: { pharmacy_id: pharmacyId, name: input, is_active: true },
      select: { id: true, name: true },
    });
    return {
      category_id: created.id,
      global_category_id: null,
      category: categoryEnum(created.name),
    };
  }

  async addMedication(body: Record<string, unknown>, pharmacyId: string, branchId: string) {
    const name = String(body.name ?? "");
    const category = await this.resolveCategory(pharmacyId, String(body.category ?? ""));
    const quantity = parseInt(String(body.quantity ?? 0), 10) || 0;
    const stockLocationId = await this.stockLocation(
      pharmacyId,
      body.stock_location_id ?? body.stockLocation ?? body.stock_location,
    );
    const existing = await this.prisma.medications.findFirst({
      where: { pharmacy_id: pharmacyId, name },
      select: { id: true },
    });
    let medicationId = existing?.id;
    if (medicationId) {
      const inventory = await this.prisma.inventory.findFirst({
        where: { pharmacy_id: pharmacyId, branch_id: branchId, medication_id: medicationId },
        select: { id: true, quantity_in_stock: true },
      });
      if (inventory) {
        const newQuantity = (inventory.quantity_in_stock ?? 0) + quantity;
        try {
          await this.prisma.inventory.update({
            where: { id: inventory.id },
            data: {
              quantity_in_stock: newQuantity,
              ...(stockLocationId ? { stock_location_id: stockLocationId } : {}),
            },
          });
        } catch (error) {
          if (!stockLocationId || !isMissingStockLocation(error)) throw error;
          await this.prisma.inventory.update({
            where: { id: inventory.id },
            data: { quantity_in_stock: newQuantity },
          });
        }
        return {
          success: true as const,
          message: "Quantity updated",
          medicationId,
          inventory: {
            id: inventory.id,
            quantity_in_stock: newQuantity,
            stock_location_id: stockLocationId,
          },
        };
      }
    } else {
      const medication = await this.prisma.medications.create({
        data: {
          pharmacy_id: pharmacyId,
          name,
          ...category,
          requires_prescription:
            category.category === "prescription" || category.category === "controlled",
          is_active: true,
        },
        select: { id: true },
      });
      medicationId = medication.id;
    }
    const inventory = await this.createInventory({
      pharmacyId,
      branchId,
      medicationId: medicationId!,
      batchNumber: String(body.batch_number || "BATCH001"),
      quantity,
      unitCost: parseFloat(String(body.unit_cost ?? 0)) || 0,
      sellingPrice: parseFloat(String(body.selling_price ?? 0)) || 0,
      minimumStockLevel: parseInt(String(body.minimum_stock_level ?? 0), 10) || 0,
      expiryDate: String(body.expiry_date || "2030-12-31"),
      stockLocation: stockLocationId,
    });
    return { success: true as const, medicationId: medicationId!, inventory };
  }

  async adjust(id: string, type: "increase" | "decrease", quantity: number, pharmacyId?: string) {
    if (type === "decrease") {
      const where = pharmacyId
        ? { id, pharmacy_id: pharmacyId, quantity_in_stock: { gte: quantity } }
        : { id, quantity_in_stock: { gte: quantity } };
      const result = await this.prisma.inventory.updateMany({
        where,
        data: { quantity_in_stock: { decrement: quantity } },
      });
      if (result.count === 0) {
        const exists = await this.prisma.inventory.findFirst({
          where: pharmacyId ? { id, pharmacy_id: pharmacyId } : { id },
          select: { quantity_in_stock: true },
        });
        if (!exists) throw new Error("Product not found");
        throw new Error(`Insufficient stock. Available: ${exists.quantity_in_stock ?? 0}`);
      }
      const updated = await this.prisma.inventory.findUnique({
        where: { id },
        select: { quantity_in_stock: true },
      });
      return updated?.quantity_in_stock ?? 0;
    }

    const where = pharmacyId ? { id, pharmacy_id: pharmacyId } : { id };
    const result = await this.prisma.inventory.updateMany({
      where,
      data: { quantity_in_stock: { increment: quantity } },
    });
    if (result.count === 0) throw new Error("Product not found");
    const updated = await this.prisma.inventory.findUnique({
      where: { id },
      select: { quantity_in_stock: true },
    });
    return updated?.quantity_in_stock ?? 0;
  }

  async updateInventory(id: string, body: Record<string, unknown>, pharmacyId?: string) {
    const where = pharmacyId ? { id, pharmacy_id: pharmacyId } : { id };
    const result = await this.prisma.inventory.updateMany({
      where,
      data: {
        ...(body.quantity !== undefined ? { quantity_in_stock: Number(body.quantity) } : {}),
        ...(body.selling_price !== undefined ? { selling_price: Number(body.selling_price) } : {}),
        ...(body.minimum_stock_level !== undefined
          ? { minimum_stock_level: Number(body.minimum_stock_level) }
          : {}),
      },
    });
    if (result.count === 0) throw new Error("Product not found");
  }

  async deleteInventory(id: string, pharmacyId?: string) {
    if (pharmacyId) {
      const result = await this.prisma.inventory.deleteMany({
        where: { id, pharmacy_id: pharmacyId },
      });
      if (result.count === 0) throw new Error("Product not found");
    } else {
      await this.prisma.inventory.delete({ where: { id } });
    }
  }

  async analytics(pharmacyId: string) {
    const { rows: items } = await this.list(pharmacyId, null, 1, 10000);
    const stats: Record<string, { stock: number; value: number }> = {};
    let currentValue = 0;
    for (const item of items) {
      const category = item.category || "other";
      const stock = item.stock ?? 0;
      const price = item.price ?? 0;
      stats[category] ??= { stock: 0, value: 0 };
      stats[category].stock += stock;
      stats[category].value += stock * price;
      currentValue += stock * price;
    }
    const stockByCategory = Object.entries(stats).map(([category, value]) => ({
      category,
      stock: value.stock,
      value: Math.round(value.value),
    }));
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const currentMonth = new Date().getMonth();
    const inventoryTrend = months.slice(0, currentMonth + 1).map((month, index) => ({
      month,
      value: Math.round(
        currentValue * (currentMonth === 0 ? 1 : 0.7 + (index / currentMonth) * 0.3),
      ),
    }));
    return { stockByCategory, inventoryTrend };
  }

  async importRows(
    rows: Array<Record<string, unknown>>,
    pharmacyId: string,
    branchId: string,
  ) {
    const failures: Array<{ rowNumber: number; label: string; error: string }> = [];
    let succeeded = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]!;
      const normalized = {
        name: String(row.name ?? "").trim(),
        category: String(row.category ?? "").trim(),
        batch_number: String(row.batch_number ?? "BATCH001").trim(),
        quantity: Number(row.quantity) || 0,
        unit_cost: Number(row.unit_cost) || 0,
        selling_price: Number(row.selling_price) || 0,
        minimum_stock_level: Number(row.minimum_stock_level) || 0,
        expiry_date: String(row.expiry_date ?? "").trim(),
      };
      try {
        await this.addMedication(normalized, pharmacyId, branchId);
        succeeded += 1;
      } catch (error) {
        failures.push({
          rowNumber: index + 2,
          label: normalized.name || "Unnamed product",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    return {
      success: failures.length === 0,
      attempted: rows.length,
      succeeded,
      failures,
    };
  }

  async receivePurchase(id: string, quantity: number, costPrice?: number, pharmacyId?: string) {
    const newStock = await this.adjust(id, "increase", quantity, pharmacyId);
    if (costPrice != null) {
      const where = pharmacyId ? { id, pharmacy_id: pharmacyId } : { id };
      await this.prisma.inventory.updateMany({
        where,
        data: { unit_cost: costPrice },
      });
    }
    return newStock;
  }

  async suppliers(pharmacyId: string) {
    return this.prisma.suppliers.findMany({
      where: { pharmacy_id: pharmacyId, is_active: true },
      orderBy: { created_at: "desc" },
    });
  }

  async createSupplier(pharmacyId: string, body: Record<string, unknown>) {
    return this.prisma.suppliers.create({
      data: {
        pharmacy_id: pharmacyId,
        name: String(body.name),
        contact_person: body.contact ? String(body.contact) : null,
        phone: body.phone ? String(body.phone) : null,
        email: body.email ? String(body.email) : null,
        is_active: true,
      },
    });
  }

  async transfers(pharmacyId: string) {
    const rows = await this.prisma.inventory_transfers.findMany({
      where: { pharmacy_id: pharmacyId },
      orderBy: { created_at: "desc" },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      product: row.medication_name,
      quantity: row.quantity,
      from: row.from_branch_id,
      to: row.to_branch_id,
      status: row.status,
      date: row.created_at?.toISOString() ?? null,
    }));
  }

  async transfer(input: {
    pharmacyId: string;
    inventoryId: string;
    fromBranchId: string;
    toBranchId: string;
    quantity: number;
  }) {
    if (input.fromBranchId === input.toBranchId) {
      throw new Error("Source and destination branch must be different");
    }
    if (input.quantity <= 0) throw new Error("Quantity must be greater than zero");
    return this.prisma.$transaction(async (tx) => {
      const source = await tx.inventory.findFirst({
        where: {
          id: input.inventoryId,
          pharmacy_id: input.pharmacyId,
          branch_id: input.fromBranchId,
        },
        include: { medications: { select: { name: true } } },
      });
      if (!source) throw new Error("Product not found at the source branch");
      const sourceQty = source.quantity_in_stock ?? 0;
      if (sourceQty < input.quantity) {
        throw new Error(`Insufficient stock at source branch. Available: ${sourceQty}`);
      }
      const sourceStock = sourceQty - input.quantity;
      await tx.inventory.update({
        where: { id: source.id },
        data: { quantity_in_stock: sourceStock, updated_at: new Date() },
      });
      const destination = await tx.inventory.findFirst({
        where: {
          pharmacy_id: input.pharmacyId,
          branch_id: input.toBranchId,
          medication_id: source.medication_id,
          batch_number: source.batch_number,
        },
        select: { id: true, quantity_in_stock: true },
      });
      const destinationStock = (destination?.quantity_in_stock ?? 0) + input.quantity;
      if (destination) {
        await tx.inventory.update({
          where: { id: destination.id },
          data: { quantity_in_stock: destinationStock, updated_at: new Date() },
        });
      } else {
        await tx.inventory.create({
          data: {
            pharmacy_id: input.pharmacyId,
            branch_id: input.toBranchId,
            medication_id: source.medication_id,
            supplier_id: source.supplier_id,
            batch_number: source.batch_number,
            quantity_in_stock: input.quantity,
            unit_cost: source.unit_cost,
            selling_price: source.selling_price,
            minimum_stock_level: source.minimum_stock_level,
            expiry_date: source.expiry_date,
            manufacturing_date: source.manufacturing_date,
          },
        });
      }
      const transfer = await tx.inventory_transfers.create({
        data: {
          pharmacy_id: input.pharmacyId,
          medication_name: source.medications?.name ?? "Product",
          quantity: input.quantity,
          from_branch_id: input.fromBranchId,
          to_branch_id: input.toBranchId,
          status: "completed",
          completed_at: new Date(),
        },
        select: { id: true },
      });
      return { transferId: transfer.id, sourceStock, destinationStock };
    });
  }
}
