import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type CategoryItem = {
  id: string;
  name: string;
  description: string | null;
  scope: "global" | "platform" | "pharmacy";
};

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(pharmacyId: string): Promise<CategoryItem[]> {
    const [platform, pharmacy, global] = await Promise.all([
      this.prisma.categories.findMany({
        where: { pharmacy_id: null, is_active: { not: false } },
        orderBy: { name: "asc" },
      }),
      this.prisma.categories.findMany({
        where: { pharmacy_id: pharmacyId, is_active: { not: false } },
        orderBy: { name: "asc" },
      }),
      this.prisma.global_categories.findMany({
        where: { is_active: { not: false } },
        orderBy: { name: "asc" },
      }),
    ]);
    const values = new Map<string, CategoryItem>();
    const add = (
      rows: Array<{ id: string; name: string; description: string | null }>,
      scope: CategoryItem["scope"],
    ) => {
      for (const row of rows) {
        const name = row.name.trim();
        if (name) values.set(name.toLowerCase(), { ...row, name, scope });
      }
    };
    add(global, "global");
    add(platform, "platform");
    add(pharmacy, "pharmacy");
    return [...values.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }

  create(pharmacyId: string, name: string, description: string) {
    return this.prisma.categories.create({
      data: { pharmacy_id: pharmacyId, name, description, is_active: true },
    });
  }

  async update(
    pharmacyId: string,
    id: string,
    body: { name?: string; description?: string; status?: string },
  ) {
    const result = await this.prisma.categories.updateMany({
      where: { id, pharmacy_id: pharmacyId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined
          ? { description: body.description }
          : {}),
        is_active: body.status === "Active",
        updated_at: new Date(),
      },
    });
    if (!result.count) return null;
    return this.prisma.categories.findFirst({ where: { id, pharmacy_id: pharmacyId } });
  }

  delete(pharmacyId: string, id: string) {
    return this.prisma.categories.deleteMany({
      where: { id, pharmacy_id: pharmacyId },
    });
  }
}
