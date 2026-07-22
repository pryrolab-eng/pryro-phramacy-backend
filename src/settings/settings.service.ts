import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import otplib from "otplib";
import QRCode from "qrcode";
import crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

const SETTINGS_KEY = "security";
const INTEGRATIONS_KEY = "pharmacy_integrations";
const DEFAULT_INTEGRATIONS_CONFIG = {
  supplierSync: { enabled: false, provider: "", endpoint: "" },
  sms: { enabled: false, provider: "", senderId: "" },
};
const ALLOWED_REPORT_FREQUENCIES = new Set(["off", "daily", "weekly", "monthly"]);

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Platform helpers ---

  async isPlatformAdmin(userId: string): Promise<boolean> {
    const row = await this.prisma.public_users.findUnique({
      where: { id: userId },
      select: { is_platform_admin: true },
    });
    return row?.is_platform_admin === true;
  }

  async getAllowUserTwoFactor(): Promise<boolean> {
    const row = await this.prisma.system_settings.findFirst({
      where: { pharmacy_id: null, setting_key: "allowUserTwoFactor" },
      select: { setting_value: true },
    });
    return row?.setting_value === true || row?.setting_value === "true";
  }

  // --- Security settings ---

  async getSecuritySettings(pharmacyId: string) {
    const row = await this.prisma.pharmacy_settings.findUnique({
      where: {
        pharmacy_id_setting_key: {
          pharmacy_id: pharmacyId,
          setting_key: SETTINGS_KEY,
        },
      },
      select: { setting_value: true },
    });
    if (row?.setting_value && typeof row.setting_value === "object") {
      return row.setting_value as { ip_whitelist_enabled?: boolean };
    }
    return { ip_whitelist_enabled: false };
  }

  async updateSecuritySettings(
    pharmacyId: string,
    body: Record<string, unknown>,
  ) {
    await this.prisma.pharmacy_settings.upsert({
      where: {
        pharmacy_id_setting_key: {
          pharmacy_id: pharmacyId,
          setting_key: SETTINGS_KEY,
        },
      },
      create: {
        pharmacy_id: pharmacyId,
        setting_key: SETTINGS_KEY,
        setting_value: body as Prisma.InputJsonValue,
      },
      update: {
        setting_value: body as Prisma.InputJsonValue,
        updated_at: new Date(),
      },
    });
  }

  // --- 2FA ---

  async getTwoFactorStatus(userId: string) {
    const [platformAllows, row] = await Promise.all([
      this.getAllowUserTwoFactor(),
      this.prisma.public_users.findUnique({
        where: { id: userId },
        select: { two_factor_enabled: true },
      }),
    ]);
    return {
      enabled: platformAllows ? (row?.two_factor_enabled === true) : false,
      platformAllowsTwoFactor: platformAllows,
    };
  }

  async toggleTwoFactor(userId: string, enabled: boolean) {
    if (!enabled) {
      await this.prisma.public_users.update({
        where: { id: userId },
        data: {
          two_factor_enabled: false,
          two_factor_secret: null,
          two_factor_backup_codes: [],
          updated_at: new Date(),
        },
      });
      return { success: true, enabled: false };
    }
    return { success: false, error: "Use /setup endpoint to enable 2FA" };
  }

  async setupTwoFactor(userId: string, email: string | null) {
    const secret = otplib.generateSecret();
    const issuer = await this.isPlatformAdmin(userId)
      ? "Pryrox Admin"
      : "Pryrox Pharmacy";
    const otpauthUrl = otplib.generateURI({
      strategy: "totp",
      label: email || "user",
      issuer,
      secret,
    });
    const qrCode = await QRCode.toDataURL(otpauthUrl);
    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString("hex").toUpperCase(),
    );

    await this.prisma.public_users.update({
      where: { id: userId },
      data: {
        two_factor_secret: secret,
        two_factor_backup_codes: backupCodes,
        updated_at: new Date(),
      },
    });

    return { secret, qrCode, backupCodes };
  }

  async verifyTwoFactor(userId: string, token: string) {
    const user = await this.prisma.public_users.findUnique({
      where: { id: userId },
      select: { two_factor_secret: true },
    });
    if (!user?.two_factor_secret) {
      throw new Error("No 2FA secret found");
    }
    const isValid = await otplib.verify({
      token,
      secret: user.two_factor_secret,
    });
    if (!isValid) {
      throw new Error("Invalid code");
    }
    await this.prisma.public_users.update({
      where: { id: userId },
      data: { two_factor_enabled: true, updated_at: new Date() },
    });
  }

  // --- IP whitelist ---

  async toggleIpWhitelist(pharmacyId: string, enabled: boolean) {
    await this.updateSecuritySettings(pharmacyId, { ip_whitelist_enabled: enabled });
    return { success: true, enabled };
  }

  async listWhitelistEntries(pharmacyId: string | null) {
    return this.prisma.ip_whitelist.findMany({
      where: { pharmacy_id: pharmacyId },
      orderBy: { created_at: "desc" },
    });
  }

  async addWhitelistEntry(
    pharmacyId: string | null,
    ipAddress: string,
    description: string,
  ) {
    return this.prisma.ip_whitelist.create({
      data: {
        pharmacy_id: pharmacyId,
        ip_address: ipAddress,
        description: description || "",
        is_active: true,
      },
    });
  }

  async deleteWhitelistEntry(id: string, pharmacyId: string | null) {
    await this.prisma.ip_whitelist.deleteMany({
      where: { id, pharmacy_id: pharmacyId },
    });
  }

  // --- Integrations ---

  async getIntegrations(pharmacyId: string) {
    const [setting, suppliersCount] = await Promise.all([
      this.prisma.system_settings.findUnique({
        where: {
          pharmacy_id_setting_key: {
            pharmacy_id: pharmacyId,
            setting_key: INTEGRATIONS_KEY,
          },
        },
      }),
      this.prisma.suppliers.count({
        where: { pharmacy_id: pharmacyId, is_active: true },
      }),
    ]);
    const config = setting?.setting_value && typeof setting.setting_value === "object"
      ? { ...DEFAULT_INTEGRATIONS_CONFIG, ...(setting.setting_value as object) }
      : DEFAULT_INTEGRATIONS_CONFIG;
    return {
      config,
      status: {
        activeSuppliers: suppliersCount,
        supplierSyncConnected: false,
        smsConnected: false,
      },
    };
  }

  async updateIntegrations(pharmacyId: string, body: Record<string, unknown>) {
    const current = await this.getIntegrations(pharmacyId);
    const merged = {
      supplierSync: { ...DEFAULT_INTEGRATIONS_CONFIG.supplierSync, ...((body.supplierSync ?? {}) as object) },
      sms: { ...DEFAULT_INTEGRATIONS_CONFIG.sms, ...((body.sms ?? {}) as object) },
    };
    const saved = await this.prisma.system_settings.upsert({
      where: {
        pharmacy_id_setting_key: {
          pharmacy_id: pharmacyId,
          setting_key: INTEGRATIONS_KEY,
        },
      },
      create: {
        pharmacy_id: pharmacyId,
        setting_key: INTEGRATIONS_KEY,
        setting_value: merged as Prisma.InputJsonValue,
      },
      update: {
        setting_value: merged as Prisma.InputJsonValue,
        updated_at: new Date(),
      },
    });
    return { success: true, config: saved.setting_value };
  }

  // --- Locations ---

  async listLocations(pharmacyId: string | null) {
    if (pharmacyId) {
      return this.prisma.stock_locations.findMany({
        where: { pharmacy_id: pharmacyId, is_active: true },
        orderBy: { created_at: "asc" },
      });
    }
    const row = await this.prisma.system_settings.findFirst({
      where: { pharmacy_id: null, setting_key: "stockLocationTemplates" },
      select: { setting_value: true },
    });
    if (row?.setting_value && Array.isArray(row.setting_value)) {
      return row.setting_value;
    }
    return [
      { id: "1", name: "Main Store", description: "Primary location", is_active: true },
      { id: "2", name: "Branch", description: "Secondary location", is_active: true },
      { id: "3", name: "Cold Storage", description: "Temperature controlled", is_active: true },
      { id: "4", name: "Warehouse", description: "Bulk storage", is_active: true },
    ];
  }

  async createLocation(pharmacyId: string, name: string, description?: string) {
    return this.prisma.stock_locations.create({
      data: {
        pharmacy_id: pharmacyId,
        name,
        description: description || "",
        is_active: true,
      },
    });
  }

  async createGlobalLocationTemplate(name: string, description?: string) {
    const existing = await this.prisma.system_settings.findFirst({
      where: { pharmacy_id: null, setting_key: "stockLocationTemplates" },
      select: { id: true, setting_value: true },
    });
    const templates = Array.isArray(existing?.setting_value) ? [...existing.setting_value] : [];
    const template = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description?.trim() ?? "",
      is_active: true,
    };
    templates.push(template);
    if (existing) {
      await this.prisma.system_settings.update({
        where: { id: existing.id },
        data: { setting_value: templates as Prisma.InputJsonValue, updated_at: new Date() },
      });
    } else {
      await this.prisma.system_settings.create({
        data: {
          pharmacy_id: null,
          setting_key: "stockLocationTemplates",
          setting_value: templates as Prisma.InputJsonValue,
        },
      });
    }
    return template;
  }

  // --- Report schedules ---

  async listReportSchedules(pharmacyId: string) {
    const schedules = await this.prisma.report_schedules.findMany({
      where: { pharmacy_id: pharmacyId },
      orderBy: { report_type: "asc" },
    });
    return {
      schedules: schedules.map((row) => ({
        id: row.id,
        reportType: row.report_type,
        frequency: row.frequency,
        recipients: Array.isArray(row.recipients) ? row.recipients : [],
        isActive: row.is_active,
      })),
    };
  }

  async upsertReportSchedule(
    pharmacyId: string,
    input: { reportType?: string; frequency: string; recipients?: string[]; isActive?: boolean },
  ) {
    if (!ALLOWED_REPORT_FREQUENCIES.has(input.frequency)) {
      throw new Error("Invalid frequency");
    }
    const reportType = (input.reportType ?? "sales").trim() || "sales";
    const recipients = this.normalizeRecipients(input.recipients);
    const schedule = await this.prisma.report_schedules.upsert({
      where: {
        pharmacy_id_report_type: {
          pharmacy_id: pharmacyId,
          report_type: reportType,
        },
      },
      create: {
        pharmacy_id: pharmacyId,
        report_type: reportType,
        frequency: input.frequency,
        recipients: recipients as Prisma.InputJsonValue,
        is_active: input.frequency !== "off" && input.isActive !== false,
      },
      update: {
        frequency: input.frequency,
        recipients: recipients as Prisma.InputJsonValue,
        is_active: input.frequency !== "off" && input.isActive !== false,
        updated_at: new Date(),
      },
    });
    return {
      success: true,
      schedule: {
        id: schedule.id,
        reportType: schedule.report_type,
        frequency: schedule.frequency,
        recipients: Array.isArray(schedule.recipients) ? schedule.recipients : [],
        isActive: schedule.is_active,
      },
    };
  }

  private normalizeRecipients(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.includes("@"))
      .slice(0, 10);
  }
}
