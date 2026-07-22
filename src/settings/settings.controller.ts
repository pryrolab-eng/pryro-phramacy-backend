import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { ErrorResponseDto } from "../common/dto";
import { TenantContextService } from "../tenant/tenant-context.service";
import {
  AddIpWhitelistDto,
  CreateLocationDto,
  DeleteIpWhitelistDto,
  IntegrationsResponseDto,
  IpWhitelistListDto,
  IpWhitelistToggleDto,
  ReportScheduleDto,
  ReportSchedulesListDto,
  SecuritySettingsDto,
  StockLocationDto,
  TwoFactorSetupDto,
  TwoFactorStatusDto,
  TwoFactorToggleDto,
  TwoFactorVerifyDto,
  UpdateIntegrationsDto,
  UpdateSecuritySettingsDto,
  UpsertReportScheduleDto,
} from "./dto";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "./settings.service";

@ApiTags("Settings")
@ApiCookieAuth("pryrox_session")
@UseGuards(SessionGuard)
@Controller("settings")
export class SettingsController {
  constructor(
    private readonly service: SettingsService,
    private readonly tenant: TenantContextService,
    private readonly auditService: AuditService,
  ) {}

  // --- Security settings ---

  @Get("security")
  @ApiOperation({ summary: "Get pharmacy security settings" })
  @ApiOkResponse({ type: SecuritySettingsDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async getSecurity(@CurrentUser() user: AuthUser) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      return await this.service.getSecuritySettings(pharmacyId);
    } catch (error) {
      return { ip_whitelist_enabled: false };
    }
  }

  @Put("security")
  @ApiOperation({ summary: "Update pharmacy security settings" })
  @ApiOkResponse({ type: Object })
  async updateSecurity(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateSecuritySettingsDto,
    @Req() req: Request,
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      await this.service.updateSecuritySettings(pharmacyId, body as unknown as Record<string, unknown>);
      const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim();
      await this.auditWrite(user.id, pharmacyId, "UPDATE", "system_settings", body, ip, req.headers["user-agent"] as string);
      return { success: true };
    } catch (error) {
      throw new HttpException({ error: "Failed to update settings" }, 500);
    }
  }

  // --- 2FA ---

  @Get("security/2fa")
  @ApiOperation({ summary: "Get 2FA status for current user" })
  @ApiOkResponse({ type: TwoFactorStatusDto })
  async getTwoFactorStatus(@CurrentUser() user: AuthUser) {
    try {
      return await this.service.getTwoFactorStatus(user.id);
    } catch (error) {
      throw new HttpException({ error: "Failed to get 2FA status" }, 500);
    }
  }

  @Post("security/2fa")
  @HttpCode(200)
  @ApiOperation({ summary: "Toggle 2FA on/off for current user" })
  @ApiOkResponse({ type: Object })
  async toggleTwoFactor(
    @CurrentUser() user: AuthUser,
    @Body() body: TwoFactorToggleDto,
    @Req() req: Request,
  ) {
    try {
      if (body.enabled) {
        const platformAllows = await this.service.getAllowUserTwoFactor();
        if (!platformAllows) {
          throw new HttpException(
            { error: "Two-factor authentication is disabled by the platform administrator" },
            403,
          );
        }
      }
      const result = await this.service.toggleTwoFactor(user.id, body.enabled);
      if (!result.enabled && result.success) {
        await this.auditWrite(user.id, null, "UPDATE", "auth.users", { twoFactorEnabled: false }, req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim(), req.headers["user-agent"] as string, user.id);
      }
      if (!result.success && result.error) {
        throw new HttpException({ error: result.error }, 400);
      }
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to toggle 2FA" }, 500);
    }
  }

  @Post("security/2fa/setup")
  @ApiOperation({ summary: "Generate 2FA secret, QR code, and backup codes" })
  @ApiOkResponse({ type: TwoFactorSetupDto })
  async setupTwoFactor(@CurrentUser() user: AuthUser) {
    try {
      const platformAllows = await this.service.getAllowUserTwoFactor();
      const isAdmin = await this.service.isPlatformAdmin(user.id);
      if (!platformAllows && !isAdmin) {
        throw new HttpException(
          { error: "Two-factor authentication is disabled by the platform administrator." },
          403,
        );
      }
      return await this.service.setupTwoFactor(user.id, user.email ?? null);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to setup 2FA" }, 500);
    }
  }

  @Post("security/2fa/verify")
  @ApiOperation({ summary: "Verify 2FA token and enable" })
  @ApiOkResponse({ type: Object })
  async verifyTwoFactor(
    @CurrentUser() user: AuthUser,
    @Body() body: TwoFactorVerifyDto,
    @Req() req: Request,
  ) {
    try {
      const platformAllows = await this.service.getAllowUserTwoFactor();
      const isAdmin = await this.service.isPlatformAdmin(user.id);
      if (!platformAllows && !isAdmin) {
        throw new HttpException(
          { error: "Two-factor authentication is disabled by the platform administrator." },
          403,
        );
      }
      await this.service.verifyTwoFactor(user.id, body.token);
      await this.auditWrite(user.id, null, "UPDATE", "auth.users", { twoFactorEnabled: true }, req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim(), req.headers["user-agent"] as string, user.id);
      return { success: true };
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      const message = error instanceof Error ? error.message : "Failed to verify 2FA";
      throw new HttpException({ error: message }, message === "Invalid code" ? 400 : 500);
    }
  }

  // --- IP whitelist ---

  @Post("security/ip-whitelist")
  @HttpCode(200)
  @ApiOperation({ summary: "Toggle IP whitelist enabled/disabled" })
  async toggleIpWhitelist(
    @CurrentUser() user: AuthUser,
    @Body() body: IpWhitelistToggleDto,
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      return await this.service.toggleIpWhitelist(pharmacyId, body.enabled);
    } catch (error) {
      throw new HttpException({ error: "Failed to toggle IP whitelist" }, 500);
    }
  }

  @Get("security/ip-whitelist/manage")
  @ApiOperation({ summary: "List IP whitelist entries" })
  @ApiOkResponse({ type: IpWhitelistListDto })
  async listWhitelistEntries(@CurrentUser() user: AuthUser) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const ips = await this.service.listWhitelistEntries(pharmacyId);
      return { ips };
    } catch (error) {
      throw new HttpException({ error: "Failed to fetch IP whitelist" }, 500);
    }
  }

  @Post("security/ip-whitelist/manage")
  @ApiOperation({ summary: "Add IP whitelist entry" })
  async addWhitelistEntry(
    @CurrentUser() user: AuthUser,
    @Body() body: AddIpWhitelistDto,
    @Req() req: Request,
  ) {
    try {
      if (!body.ip) {
        throw new HttpException({ error: "IP address required" }, 400);
      }
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const entry = await this.service.addWhitelistEntry(
        pharmacyId,
        body.ip,
        body.description ?? "",
      );
      await this.auditWrite(user.id, pharmacyId, "INSERT", "ip_whitelist", entry, req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim(), req.headers["user-agent"] as string, entry.id);
      return { success: true, ip: entry };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to add IP" }, 500);
    }
  }

  @Delete("security/ip-whitelist/manage")
  @ApiOperation({ summary: "Delete IP whitelist entry" })
  async deleteWhitelistEntry(
    @CurrentUser() user: AuthUser,
    @Body() body: DeleteIpWhitelistDto,
    @Req() req: Request,
  ) {
    try {
      if (!body.id) {
        throw new HttpException({ error: "IP ID required" }, 400);
      }
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      await this.service.deleteWhitelistEntry(body.id, pharmacyId);
      await this.auditWrite(user.id, pharmacyId, "DELETE", "ip_whitelist", undefined, req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim(), req.headers["user-agent"] as string, body.id);
      return { success: true };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to delete IP" }, 500);
    }
  }

  // --- Integrations ---

  @Get("integrations")
  @ApiOperation({ summary: "Get pharmacy integration settings" })
  @ApiOkResponse({ type: IntegrationsResponseDto })
  async getIntegrations(@CurrentUser() user: AuthUser) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      return await this.service.getIntegrations(pharmacyId);
    } catch (error) {
      throw new HttpException({ error: "Failed to load integration settings" }, 500);
    }
  }

  @Put("integrations")
  @ApiOperation({ summary: "Update pharmacy integration settings" })
  async updateIntegrations(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateIntegrationsDto,
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      return await this.service.updateIntegrations(
        pharmacyId,
        body as unknown as Record<string, unknown>,
      );
    } catch (error) {
      throw new HttpException({ error: "Failed to save integration settings" }, 500);
    }
  }

  // --- Locations ---

  @Get("locations")
  @ApiOperation({ summary: "List stock locations for pharmacy (or global templates for admin)" })
  @ApiOkResponse({ type: [StockLocationDto] })
  async listLocations(@CurrentUser() user: AuthUser) {
    try {
      let pharmacyId: string | null = null;
      try {
        pharmacyId = await this.tenant.requirePharmacyId(user.id);
      } catch {
        const isAdmin = await this.service.isPlatformAdmin(user.id);
        if (isAdmin) {
          return await this.service.listLocations(null);
        }
        throw new HttpException({ error: "Pharmacy not found" }, 404);
      }
      return await this.service.listLocations(pharmacyId);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to fetch locations" }, 500);
    }
  }

  @Post("locations")
  @ApiOperation({ summary: "Create a stock location (pharmacy or global template)" })
  async createLocation(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateLocationDto,
    @Req() req: Request,
  ) {
    try {
      if (!body.name || typeof body.name !== "string") {
        throw new HttpException({ error: "Location name is required" }, 400);
      }
      let pharmacyId: string | null = null;
      try {
        pharmacyId = await this.tenant.requirePharmacyId(user.id);
      } catch {
        const isAdmin = await this.service.isPlatformAdmin(user.id);
        if (isAdmin) {
          const location = await this.service.createGlobalLocationTemplate(
            body.name,
            body.description,
          );
          await this.auditWrite(user.id, null, "INSERT", "system_settings", { setting_key: "stockLocationTemplates", location }, req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim(), req.headers["user-agent"] as string);
          return { success: true, location };
        }
        throw new HttpException({ error: "Pharmacy not found" }, 404);
      }
      const location = await this.service.createLocation(pharmacyId, body.name, body.description);
      await this.auditWrite(user.id, pharmacyId, "INSERT", "stock_locations", location, req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim(), req.headers["user-agent"] as string, location.id);
      return { success: true, location };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to create location" }, 500);
    }
  }

  // --- Report schedules ---

  @Get("report-schedules")
  @ApiOperation({ summary: "List scheduled report configurations" })
  @ApiOkResponse({ type: ReportSchedulesListDto })
  async listReportSchedules(@CurrentUser() user: AuthUser) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      return await this.service.listReportSchedules(pharmacyId);
    } catch (error) {
      throw new HttpException({ error: "Failed to load report schedules" }, 500);
    }
  }

  @Put("report-schedules")
  @ApiOperation({ summary: "Create or update a report schedule" })
  @ApiOkResponse({ type: ReportScheduleDto })
  async upsertReportSchedule(
    @CurrentUser() user: AuthUser,
    @Body() body: UpsertReportScheduleDto,
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      return await this.service.upsertReportSchedule(pharmacyId, body);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      const message = error instanceof Error ? error.message : "Failed to save report schedule";
      if (message === "Invalid frequency") {
        throw new HttpException({ error: message }, 400);
      }
      throw new HttpException({ error: message }, 500);
    }
  }

  // --- Helpers ---

  private async auditWrite(
    userId: string,
    pharmacyId: string | null,
    action: string,
    tableName: string,
    newValues?: unknown,
    ipAddress?: string,
    userAgent?: string,
    recordId?: string,
  ) {
    try {
      await this.auditService.writeAuditLog({
        pharmacyId,
        userId,
        action,
        tableName,
        recordId,
        newValues,
        ipAddress,
        userAgent,
      });
    } catch {
    }
  }
}
