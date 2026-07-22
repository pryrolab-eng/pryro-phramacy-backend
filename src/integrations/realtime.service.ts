import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type RealtimeUpdate = { type: string; data: unknown };

@Injectable()
export class RealtimeService {
  private readonly lastUpdateByPharmacy = new Map<string, Date>();

  constructor(private readonly prisma: PrismaService) {}

  async getUpdates(pharmacyId: string) {
    const since = this.lastUpdateByPharmacy.get(pharmacyId) ?? new Date();
    const result = await this.getUpdatesSince(pharmacyId, since);
    this.lastUpdateByPharmacy.set(pharmacyId, result.cursor);
    return result.updates;
  }

  async getUpdatesSince(pharmacyId: string, since: Date): Promise<{ updates: RealtimeUpdate[]; cursor: Date }> {
    const updates: RealtimeUpdate[] = [];
    let cursor = since;

    const [inventoryUpdates, newSales] = await Promise.all([
      this.prisma.inventory.findMany({
        where: { pharmacy_id: pharmacyId, updated_at: { gte: since } },
        select: { id: true, quantity_in_stock: true, updated_at: true },
      }),
      this.prisma.sales.findMany({
        where: { pharmacy_id: pharmacyId, created_at: { gte: since } },
        select: { id: true, total_amount: true, created_at: true },
      }),
    ]);

    for (const row of inventoryUpdates) {
      if (row.updated_at && row.updated_at > cursor) {
        cursor = row.updated_at;
      }
    }
    for (const row of newSales) {
      if (row.created_at && row.created_at > cursor) {
        cursor = row.created_at;
      }
    }

    if (inventoryUpdates.length) {
      updates.push({
        type: "inventory_update",
        data: inventoryUpdates.map((row) => ({
          id: row.id,
          quantityInStock: row.quantity_in_stock,
          updatedAt: row.updated_at?.toISOString() ?? null,
        })),
      });
    }

    if (newSales.length) {
      updates.push({
        type: "new_sale",
        data: newSales.map((row) => ({
          id: row.id,
          totalAmount: row.total_amount,
          createdAt: row.created_at?.toISOString() ?? null,
        })),
      });
    }

    return {
      updates,
      cursor,
    };
  }
}
