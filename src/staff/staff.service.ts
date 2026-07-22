import { Injectable } from "@nestjs/common";
import type { Prisma, user_role } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import type { FormattedStaffMember, PharmacyStaffRow } from "./models";

const BCRYPT_ROUNDS = 10;

export type AdminAuthUser = {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown>;
};

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  private mapPharmacyStaffRow(row: {
    id: string;
    user_id: string | null;
    role: user_role;
    is_active: boolean | null;
    created_at: Date | null;
    pharmacy_id: string | null;
  }): PharmacyStaffRow {
    return {
      id: row.id,
      user_id: row.user_id,
      role: row.role,
      is_active: row.is_active,
      created_at: row.created_at?.toISOString() ?? null,
      pharmacy_id: row.pharmacy_id,
    };
  }

  async listPharmacyStaff(pharmacyId: string): Promise<FormattedStaffMember[]> {
    const rows = await this.prisma.pharmacy_users.findMany({
      where: { pharmacy_id: pharmacyId },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        user_id: true,
        role: true,
        is_active: true,
        created_at: true,
      },
    });

    const userIds = rows
      .map((row) => row.user_id)
      .filter((id): id is string => Boolean(id));

    const profiles =
      userIds.length > 0
        ? await this.prisma.public_users.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, full_name: true, email: true },
          })
        : [];

    const profileById = new Map(profiles.map((p) => [p.id, p]));

    return rows
      .filter((row) => row.user_id)
      .map((row) => {
        const profile = profileById.get(row.user_id as string);
        const email = profile?.email ?? null;
        const name =
          profile?.full_name ||
          profile?.name ||
          (email ? email.split("@")[0] : "Unknown");

        return {
          id: row.id,
          name,
          email,
          phone: "N/A",
          role: row.role,
          status: row.is_active ? ("active" as const) : ("inactive" as const),
          joinDate: row.created_at
            ? new Date(row.created_at).toLocaleDateString()
            : "",
        };
      });
  }

  async findPharmacyUser(pharmacyUserId: string): Promise<PharmacyStaffRow | null> {
    const row = await this.prisma.pharmacy_users.findUnique({
      where: { id: pharmacyUserId },
    });
    return row ? this.mapPharmacyStaffRow(row) : null;
  }

  async updateStaffMember(input: {
    pharmacyUserId: string;
    authUserId: string;
    name?: string;
    phone?: string;
    role?: string;
    isActive?: boolean;
  }): Promise<void> {
    if (input.name !== undefined || input.phone !== undefined) {
      await this.prisma.public_users.update({
        where: { id: input.authUserId },
        data: {
          ...(input.name !== undefined
            ? { name: input.name, full_name: input.name }
            : {}),
          updated_at: new Date(),
        },
      });
    }
    if (input.role !== undefined || input.isActive !== undefined) {
      await this.prisma.pharmacy_users.update({
        where: { id: input.pharmacyUserId },
        data: {
          ...(input.role !== undefined ? { role: input.role as user_role } : {}),
          ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
          updated_at: new Date(),
        },
      });
    }
  }

  async deletePharmacyUser(pharmacyUserId: string): Promise<void> {
    await this.prisma.pharmacy_users.delete({ where: { id: pharmacyUserId } });
  }

  async deleteLinkedUserRecords(userId: string): Promise<void> {
    try {
      await this.prisma.public_users.delete({ where: { user_id: userId } });
    } catch (err) {
      console.error("Failed to delete public_users record:", err);
    }
    try {
      await this.prisma.auth_users.delete({ where: { id: userId } });
    } catch (err) {
      console.error("Failed to delete auth_users record:", err);
    }
  }

  async getStaffBranchIds(pharmacyUserId: string): Promise<string[]> {
    const rows = await this.prisma.staff_branch_assignments.findMany({
      where: { pharmacy_user_id: pharmacyUserId },
      select: { branch_id: true },
    });
    return rows.map((row) => row.branch_id);
  }

  async setStaffBranchAssignments(input: {
    pharmacyUserId: string;
    branchIds: string[];
  }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.staff_branch_assignments.deleteMany({
        where: { pharmacy_user_id: input.pharmacyUserId },
      }),
      ...(input.branchIds.length > 0
        ? [
            this.prisma.staff_branch_assignments.createMany({
              data: input.branchIds.map((branch_id) => ({
                pharmacy_user_id: input.pharmacyUserId,
                branch_id,
              })),
            }),
          ]
        : []),
    ]);
  }

  async countPharmacyBranchesByIds(input: {
    pharmacyId: string;
    branchIds: string[];
  }): Promise<number> {
    return this.prisma.branches.count({
      where: {
        pharmacy_id: input.pharmacyId,
        id: { in: input.branchIds },
      },
    });
  }

  async getPharmacyName(pharmacyId: string): Promise<string | null> {
    const pharmacy = await this.prisma.pharmacies.findUnique({
      where: { id: pharmacyId },
      select: { name: true },
    });
    return pharmacy?.name ?? null;
  }

  async getAuthUserById(userId: string): Promise<AdminAuthUser | null> {
    const row = await this.prisma.auth_users.findUnique({
      where: { id: userId },
      select: { id: true, email: true, raw_user_meta_data: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      user_metadata:
        (row.raw_user_meta_data as Record<string, unknown> | null) ?? {},
    };
  }

  async updateAuthUserPassword(userId: string, password: string): Promise<void> {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.prisma.auth_users.update({
      where: { id: userId },
      data: {
        encrypted_password: passwordHash,
        updated_at: new Date(),
      },
    });
  }

  async updateAuthUserMetadata(
    userId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const existing = await this.prisma.auth_users.findUnique({
      where: { id: userId },
      select: { raw_user_meta_data: true },
    });
    const merged = {
      ...((existing?.raw_user_meta_data as Record<string, unknown>) ?? {}),
      ...patch,
    };
    await this.prisma.auth_users.update({
      where: { id: userId },
      data: {
        raw_user_meta_data: merged as Prisma.InputJsonValue,
        updated_at: new Date(),
      },
    });
  }

  async createAuthUser(input: {
    email: string;
    password: string;
    fullName?: string;
    userMetadata?: Record<string, unknown>;
  }): Promise<{ user: { id: string; email: string } }> {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const now = new Date();
    const id = crypto.randomUUID();
    const meta: Record<string, unknown> = {
      ...(input.userMetadata ?? {}),
      ...(input.fullName
        ? { full_name: input.fullName, name: input.fullName }
        : {}),
    };

    await this.prisma.auth_users.create({
      data: {
        id,
        aud: "authenticated",
        role: "authenticated",
        email: input.email.trim().toLowerCase(),
        encrypted_password: passwordHash,
        email_confirmed_at: now,
        raw_user_meta_data: meta as Prisma.InputJsonValue,
        created_at: now,
        updated_at: now,
      },
    });

    const name = input.fullName ?? "";
    await this.prisma.public_users.upsert({
      where: { id },
      create: {
        id,
        email: input.email,
        name,
        full_name: name,
        user_id: id,
        token_identifier: input.email,
      },
      update: {
        email: input.email,
        ...(name ? { name, full_name: name } : {}),
        updated_at: new Date(),
      },
    });

    return { user: { id, email: input.email } };
  }

  async createPharmacyMembership(input: {
    pharmacyId: string;
    userId: string;
    role: string;
  }): Promise<void> {
    await this.prisma.pharmacy_users.create({
      data: {
        pharmacy_id: input.pharmacyId,
        user_id: input.userId,
        role: input.role as user_role,
        is_active: true,
      },
    });
  }

  async findPublicUserIdByEmail(email: string): Promise<string | null> {
    const row = await this.prisma.public_users.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    return row?.id ?? null;
  }
}
