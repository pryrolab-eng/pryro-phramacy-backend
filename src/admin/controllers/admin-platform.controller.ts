import {
  Body, Controller, Delete, Get, HttpCode, HttpException,
  Param, Post, Put, Query, Req, UseGuards,
} from "@nestjs/common";
import {
  ApiBody, ApiCookieAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../../auth/current-user.decorator";
import type { AuthUser } from "../../auth/auth.types";
import { SessionGuard } from "../../auth/session.guard";
import { RequirePlatformAdminGuard } from "../guards/require-platform-admin.guard";
import { AuditService } from "../../audit/audit.service";
import { AdminService } from "../admin.service";
import {
  UpdateSystemSettingsDto, UpdateEmailTemplateDto,
  CreateFeatureDto, UpdateFeatureDto,
  CreateApiKeyDto, UpdateApiKeyDto,
  AddIpWhitelistDto, DeleteIpWhitelistDto, CreateBackupDto,
  MaintenanceNotifyDto,
} from "../dto";

@ApiTags("Admin Platform")
@ApiCookieAuth("pryrox_session")
@UseGuards(SessionGuard, RequirePlatformAdminGuard)
@Controller("admin")
export class AdminPlatformController {
  constructor(
    private readonly admin: AdminService,
    private readonly audit: AuditService,
  ) {}

  // --- User management ---

  @Post("users")
  @ApiOperation({ summary: "Create a new auth user (staff invite)" })
  async createUser(@CurrentUser() _user: AuthUser, @Body() body: { email: string; password: string; fullName?: string }, @Req() req: Request) {
    try {
      const result = await this.admin.createAuthUser(body.email, body.password, body.fullName);
      await this.auditWrite(_user.id, null, "INSERT", "auth_users", result.user.id, null, body, req);
      return result;
    } catch (error: unknown) {
      const err = error as { status?: number; error?: string };
      throw new HttpException({ error: err.error ?? "Failed to create user" }, err.status ?? 500);
    }
  }

  @Get("users/:id")
  @ApiOperation({ summary: "Get auth user by ID" })
  async getUser(@Param("id") id: string) {
    try {
      const user = await this.admin.getAuthUserById(id);
      if (!user) throw new HttpException({ error: "User not found" }, 404);
      return user;
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to get user" }, 500);
    }
  }

  @Put("users/:id/password")
  @ApiOperation({ summary: "Update auth user password" })
  async updateUserPassword(@CurrentUser() _user: AuthUser, @Param("id") id: string, @Body() body: { password: string }, @Req() req: Request) {
    try {
      await this.admin.updateAuthUserPassword(id, body.password);
      await this.auditWrite(_user.id, null, "UPDATE", "auth_users", id, null, { securityEvent: "password_updated_by_admin" }, req);
      return { success: true };
    } catch {
      throw new HttpException({ error: "Failed to update password" }, 500);
    }
  }

  @Put("users/:id/email")
  @ApiOperation({ summary: "Update auth user email" })
  async updateUserEmail(@CurrentUser() _user: AuthUser, @Param("id") id: string, @Body() body: { email: string }, @Req() req: Request) {
    try {
      await this.admin.updateAuthUserEmail(id, body.email);
      await this.auditWrite(_user.id, null, "UPDATE", "auth_users", id, null, { securityEvent: "email_updated_by_admin" }, req);
      return { success: true };
    } catch {
      throw new HttpException({ error: "Failed to update email" }, 500);
    }
  }

  @Put("users/:id/metadata")
  @ApiOperation({ summary: "Update auth user metadata" })
  async updateUserMetadata(@CurrentUser() _user: AuthUser, @Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    try {
      await this.admin.updateAuthUserMetadata(id, body);
      await this.auditWrite(_user.id, null, "UPDATE", "auth_users", id, null, { securityEvent: "metadata_updated_by_admin" }, req);
      return { success: true };
    } catch {
      throw new HttpException({ error: "Failed to update metadata" }, 500);
    }
  }

  @Delete("users/:id")
  @ApiOperation({ summary: "Delete auth user" })
  async deleteUser(@CurrentUser() _user: AuthUser, @Param("id") id: string, @Req() req: Request) {
    try {
      await this.admin.deleteAuthUser(id);
      await this.auditWrite(_user.id, null, "DELETE", "auth_users", id, null, null, req);
      return { success: true };
    } catch {
      throw new HttpException({ error: "Failed to delete user" }, 500);
    }
  }

  // --- API key resolution (for frontend middleware) ---

  @Post("api-keys/resolve")
  @ApiOperation({ summary: "Resolve a platform API key by raw token (for frontend middleware)" })
  async resolveApiKey(@Body() body: { token: string }) {
    try {
      const key = await this.admin.resolveApiKeyByToken(body.token);
      if (!key) throw new HttpException({ error: "Invalid or expired API key" }, 404);
      return key;
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to resolve API key" }, 500);
    }
  }

  // --- System settings ---

  @Get("system-settings")
  @ApiOperation({ summary: "Get platform system settings" })
  async getSystemSettings() {
    try {
      return await this.admin.getSystemSettings();
    } catch {
      throw new HttpException({ error: "Failed to fetch settings" }, 500);
    }
  }

  @Put("system-settings")
  @ApiOperation({ summary: "Update platform system settings" })
  @ApiBody({ type: UpdateSystemSettingsDto })
  async updateSystemSettings(@CurrentUser() user: AuthUser, @Body() body: UpdateSystemSettingsDto, @Req() req: Request) {
    try {
      const result = await this.admin.updateSystemSettings(body as unknown as Record<string, unknown>);
      await this.auditWrite(user.id, null, "UPDATE", "system_settings", undefined, undefined, body, req);
      return result;
    } catch (error: unknown) {
      const err = error as { status?: number; error?: string };
      throw new HttpException(
        { error: err.error ?? "Failed to update settings" },
        err.status ?? 500,
      );
    }
  }

  // --- Email templates ---

  @Get("email-templates")
  @ApiOperation({ summary: "List email templates" })
  async listEmailTemplates() {
    try {
      return await this.admin.listEmailTemplates();
    } catch {
      throw new HttpException({ error: "Failed to load email templates" }, 500);
    }
  }

  @Put("email-templates")
  @ApiOperation({ summary: "Update an email template" })
  @ApiBody({ type: UpdateEmailTemplateDto })
  async updateEmailTemplate(@Body() body: UpdateEmailTemplateDto) {
    try {
      return await this.admin.updateEmailTemplate(body);
    } catch (error: unknown) {
      const err = error as { status?: number; error?: string };
      throw new HttpException(
        { error: err.error ?? "Failed to save email template" },
        err.status ?? 500,
      );
    }
  }

  // --- Features ---

  @Get("features")
  @ApiOperation({ summary: "List platform features" })
  async listFeatures() {
    try {
      return await this.admin.listFeatures();
    } catch {
      throw new HttpException({ error: "Failed to load features" }, 500);
    }
  }

  @Post("features")
  @ApiOperation({ summary: "Create a platform feature" })
  @ApiBody({ type: CreateFeatureDto })
  async createFeature(@Body() body: CreateFeatureDto) {
    try {
      return await this.admin.createFeature(body as unknown as Record<string, unknown>);
    } catch {
      throw new HttpException({ error: "Failed to create feature" }, 500);
    }
  }

  @Put("features/:key")
  @ApiOperation({ summary: "Update a platform feature" })
  @ApiParam({ name: "key" })
  async updateFeature(@Param("key") key: string, @Body() body: UpdateFeatureDto) {
    try {
      return await this.admin.updateFeature(decodeURIComponent(key), body as unknown as Record<string, unknown>);
    } catch {
      throw new HttpException({ error: "Failed to update feature" }, 500);
    }
  }

  // --- API keys ---

  @Get("api-keys")
  @ApiOperation({ summary: "List platform API keys" })
  async listApiKeys() {
    try {
      return await this.admin.listApiKeys();
    } catch {
      throw new HttpException({ error: "Failed to fetch API keys" }, 500);
    }
  }

  @Post("api-keys")
  @ApiOperation({ summary: "Create a platform API key" })
  @ApiBody({ type: CreateApiKeyDto })
  async createApiKey(@CurrentUser() user: AuthUser, @Body() body: CreateApiKeyDto, @Req() req: Request) {
    try {
      const result = await this.admin.createApiKey({ ...body, createdBy: user.id });
      await this.auditWrite(user.id, null, "INSERT", "api_keys", result.apiKey?.id, null, body, req);
      return result;
    } catch (error: unknown) {
      const err = error as { status?: number; error?: string };
      throw new HttpException(
        { error: err.error ?? "Failed to create API key" },
        err.status ?? 500,
      );
    }
  }

  @Put("api-keys")
  @ApiOperation({ summary: "Update a platform API key" })
  @ApiBody({ type: UpdateApiKeyDto })
  async updateApiKey(@CurrentUser() user: AuthUser, @Body() body: UpdateApiKeyDto, @Req() req: Request) {
    try {
      const result = await this.admin.updateApiKey(body);
      await this.auditWrite(user.id, null, "UPDATE", "api_keys", body.id, null, body, req);
      return result;
    } catch {
      throw new HttpException({ error: "Failed to update API key" }, 500);
    }
  }

  @Delete("api-keys")
  @ApiOperation({ summary: "Delete a platform API key" })
  @ApiQuery({ name: "id", required: true })
  async deleteApiKey(@Query("id") id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    if (!id) throw new HttpException({ error: "ID required" }, 400);
    try {
      const result = await this.admin.deleteApiKey(id);
      await this.auditWrite(user.id, null, "DELETE", "api_keys", id, null, null, req);
      return result;
    } catch {
      throw new HttpException({ error: "Failed to delete API key" }, 500);
    }
  }

  // --- IP whitelist ---

  @Get("ip-whitelist")
  @ApiOperation({ summary: "List platform IP whitelist" })
  async listIpWhitelist() {
    try {
      return await this.admin.listIpWhitelist();
    } catch {
      throw new HttpException({ error: "Failed to fetch IP whitelist" }, 500);
    }
  }

  @Post("ip-whitelist")
  @ApiOperation({ summary: "Add IP to platform whitelist" })
  @ApiBody({ type: AddIpWhitelistDto })
  async addIpWhitelist(@Body() body: AddIpWhitelistDto) {
    if (!body.ip) throw new HttpException({ error: "IP address required" }, 400);
    try {
      return await this.admin.addIpToWhitelist(body);
    } catch {
      throw new HttpException({ error: "Failed to add IP" }, 500);
    }
  }

  @Delete("ip-whitelist")
  @ApiOperation({ summary: "Remove IP from platform whitelist" })
  @ApiBody({ type: DeleteIpWhitelistDto })
  async deleteIpWhitelist(@Body() body: DeleteIpWhitelistDto) {
    if (!body.id) throw new HttpException({ error: "ID required" }, 400);
    try {
      return await this.admin.removeIpFromWhitelist(body.id);
    } catch {
      throw new HttpException({ error: "Failed to delete IP" }, 500);
    }
  }

  // --- Backups ---

  @Get("backups")
  @ApiOperation({ summary: "List platform backups" })
  async listBackups() {
    try {
      return await this.admin.listBackups();
    } catch {
      throw new HttpException({ error: "Failed to fetch backups" }, 500);
    }
  }

  @Post("backups")
  @ApiOperation({ summary: "Create a platform backup" })
  @ApiBody({ type: CreateBackupDto })
  async createBackup(@Body() body: CreateBackupDto) {
    try {
      return await this.admin.createBackup(body);
    } catch {
      throw new HttpException({ error: "Backup failed" }, 500);
    }
  }

  // --- AI trace events ---

  @Get("ai-trace-events")
  @ApiOperation({ summary: "List AI trace events" })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "pageSize", required: false })
  @ApiQuery({ name: "pharmacyId", required: false })
  @ApiQuery({ name: "feature", required: false })
  @ApiQuery({ name: "success", required: false })
  @ApiQuery({ name: "from", required: false })
  @ApiQuery({ name: "to", required: false })
  async listAiTraceEvents(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("pharmacyId") pharmacyId?: string,
    @Query("feature") feature?: string,
    @Query("success") success?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    try {
      return await this.admin.listAiTraceEvents({ page, pageSize, pharmacyId, feature, success, from, to });
    } catch {
      throw new HttpException({ error: "Failed to fetch AI trace events" }, 500);
    }
  }

  // --- Global search ---

  @Get("search")
  @ApiOperation({ summary: "Global admin search" })
  @ApiQuery({ name: "q", required: true })
  async search(@Query("q") q?: string) {
    try {
      return await this.admin.searchGlobal(q ?? "");
    } catch {
      return { pharmacies: [], staff: [], branches: [] };
    }
  }

  // --- Maintenance notifications ---

  @Get("maintenance/notify")
  @ApiOperation({ summary: "Get maintenance notification stats" })
  async getMaintenanceStats() {
    try {
      return await this.admin.getMaintenanceStats();
    } catch {
      throw new HttpException({ error: "Failed to fetch notification stats" }, 500);
    }
  }

  @Post("maintenance/notify")
  @ApiOperation({ summary: "Send maintenance notifications" })
  @ApiBody({ type: MaintenanceNotifyDto })
  async sendMaintenanceNotification(@CurrentUser() user: AuthUser, @Body() body: MaintenanceNotifyDto) {
    try {
      return await this.admin.sendMaintenanceNotification(body, user.id);
    } catch {
      throw new HttpException({ error: "Failed to queue notifications" }, 500);
    }
  }

  private async auditWrite(
    userId: string, pharmacyId: string | null, action: string,
    tableName: string, recordId?: string, oldValues?: unknown,
    newValues?: unknown, req?: Request,
  ) {
    try {
      await this.audit.writeAuditLog({
        pharmacyId,
        userId,
        action,
        tableName,
        recordId,
        oldValues,
        newValues,
        ipAddress: req?.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim(),
        userAgent: req?.headers["user-agent"],
      });
    } catch {}
  }
}
