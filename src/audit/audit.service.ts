import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type AuditLogInput = {
  pharmacyId: string | null;
  userId: string | null;
  action: string;
  tableName?: string;
  recordId?: string;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async writeAuditLog(input: AuditLogInput): Promise<void> {
    try {
      const setting = await this.prisma.system_settings.findFirst({
        where: { pharmacy_id: null, setting_key: "enableAuditLogs" },
        select: { setting_value: true },
      });
      if (setting && setting.setting_value === false) return;
      await this.prisma.audit_logs.create({
        data: {
          pharmacy_id: input.pharmacyId,
          user_id: input.userId,
          action: input.action,
          table_name: input.tableName ?? null,
          record_id: input.recordId ?? null,
          old_values:
            input.oldValues === undefined
              ? undefined
              : (input.oldValues as Prisma.InputJsonValue),
          new_values:
            input.newValues === undefined
              ? undefined
              : (input.newValues as Prisma.InputJsonValue),
          ip_address: input.ipAddress?.trim() || null,
          user_agent: input.userAgent ?? null,
        },
      });
    } catch (error) {
      console.error("writeAuditLog error:", error);
    }
  }
}
