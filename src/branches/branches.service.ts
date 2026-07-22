import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type UpdatedBranch = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean | null;
  updated_at: Date | null;
};

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async exists(pharmacyId: string, branchId: string): Promise<boolean> {
    const row = await this.prisma.branches.findFirst({
      where: { id: branchId, pharmacy_id: pharmacyId },
      select: { id: true },
    });
    return Boolean(row);
  }

  async existsActive(pharmacyId: string, branchId: string): Promise<boolean> {
    const row = await this.prisma.branches.findFirst({
      where: { id: branchId, pharmacy_id: pharmacyId, is_active: true },
      select: { id: true },
    });
    return Boolean(row);
  }

  async update(
    branchId: string,
    body: Record<string, unknown>,
  ): Promise<UpdatedBranch> {
    return this.prisma.branches.update({
      where: { id: branchId },
      data: {
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.address !== undefined || body.location !== undefined
          ? { address: (body.address ?? body.location ?? null) as string | null }
          : {}),
        ...(body.phone !== undefined
          ? { phone: (body.phone ?? null) as string | null }
          : {}),
        ...(body.email !== undefined
          ? { email: (body.email ?? null) as string | null }
          : {}),
        ...(body.is_active !== undefined
          ? { is_active: Boolean(body.is_active) }
          : body.status !== undefined
            ? { is_active: body.status === "active" }
            : {}),
        updated_at: new Date(),
      },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        email: true,
        is_active: true,
        updated_at: true,
      },
    });
  }
}
