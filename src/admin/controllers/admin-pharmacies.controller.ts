import {
  Body, Controller, Delete, Get, HttpCode, HttpException,
  Param, Post, Put, Req, UploadedFile, UseGuards, UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../../auth/current-user.decorator";
import type { AuthUser } from "../../auth/auth.types";
import { SessionGuard } from "../../auth/session.guard";
import { RequirePlatformAdminGuard } from "../guards/require-platform-admin.guard";
import { PharmacyBrandingService } from "../../pharmacy/pharmacy-branding.service";
import type { UploadedLogoFile } from "../../pharmacy/pharmacy-branding.service";
import { AuditService } from "../../audit/audit.service";
import { AdminService } from "../admin.service";
import {
  AdminCreatePharmacyDto as CreatePharmacyDto, UpdatePharmacyDto, BrandingUpdateDto,
} from "../dto";

@ApiTags("Admin Pharmacies")
@ApiCookieAuth("pryrox_session")
@UseGuards(SessionGuard, RequirePlatformAdminGuard)
@Controller("admin/pharmacies")
export class AdminPharmaciesController {
  constructor(
    private readonly admin: AdminService,
    private readonly branding: PharmacyBrandingService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List all pharmacies with enriched data" })
  async list() {
    try {
      return await this.admin.listPharmacies();
    } catch (error) {
      return [];
    }
  }

  @Post()
  @ApiOperation({ summary: "Create a new pharmacy with owner user" })
  @ApiBody({ type: CreatePharmacyDto })
  async create(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>, @Req() req: Request) {
    try {
      const result = await this.admin.createPharmacy(body);
      await this.auditWrite(user.id, null, "INSERT", "pharmacies", result.pharmacy?.id, null, result, req);
      return result;
    } catch (error: unknown) {
      const err = error as { status?: number; error?: string };
      throw new HttpException(
        { success: false, error: err.error ?? "Failed to create pharmacy" },
        err.status ?? 500,
      );
    }
  }

  @Get(":id")
  @ApiOperation({ summary: "Get pharmacy detail" })
  @ApiParam({ name: "id" })
  async getDetail(@Param("id") id: string) {
    try {
      return await this.admin.getPharmacyDetail(id);
    } catch (error: unknown) {
      const err = error as { status?: number; error?: string };
      throw new HttpException(
        { error: err.error ?? "Failed to load pharmacy detail" },
        err.status ?? 500,
      );
    }
  }

  @Put(":id")
  @ApiOperation({ summary: "Update pharmacy" })
  @ApiParam({ name: "id" })
  async update(@Param("id") id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: AuthUser, @Req() req: Request) {
    try {
      const result = await this.admin.updatePharmacy(id, body);
      await this.auditWrite(user.id, null, "UPDATE", "pharmacies", id, null, body, req);
      return result;
    } catch (error: unknown) {
      const err = error as { status?: number; error?: string };
      throw new HttpException(
        { success: false, error: err.error ?? "Failed to update pharmacy" },
        err.status ?? 500,
      );
    }
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete pharmacy" })
  @ApiParam({ name: "id" })
  async remove(@Param("id") id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    try {
      const result = await this.admin.deletePharmacy(id);
      await this.auditWrite(user.id, null, "DELETE", "pharmacies", id, { id }, null, req);
      return result;
    } catch (error: unknown) {
      const err = error as { status?: number; error?: string };
      throw new HttpException(
        { success: false, error: err.error ?? "Failed to delete pharmacy" },
        err.status ?? 500,
      );
    }
  }

  @Post("repair")
  @HttpCode(200)
  @ApiOperation({ summary: "Repair pharmacy subscription data" })
  async repair() {
    try {
      const result = await this.admin.repairPharmacySubscriptions();
      return { success: true, ...result };
    } catch {
      throw new HttpException({ success: false, error: "Repair failed" }, 500);
    }
  }

  @Get(":id/branding")
  @ApiOperation({ summary: "Get pharmacy branding" })
  async getBranding(@Param("id") id: string) {
    try {
      return await this.admin.getPharmacyBranding(id);
    } catch (error: unknown) {
      const err = error as { status?: number; error?: string };
      throw new HttpException(
        { error: err.error ?? "Failed to load branding" },
        err.status ?? 500,
      );
    }
  }

  @Put(":id/branding")
  @ApiOperation({ summary: "Update pharmacy branding" })
  async updateBranding(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    try {
      return await this.admin.updatePharmacyBranding(id, body);
    } catch {
      throw new HttpException({ error: "Failed to update branding" }, 500);
    }
  }

  @Post(":id/branding/upload")
  @HttpCode(200)
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "Upload pharmacy logo" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } })
  async uploadLogo(@Param("id") id: string, @UploadedFile() file: UploadedLogoFile | undefined) {
    try {
      if (!file) throw new HttpException({ error: "No file provided" }, 400);
      return { success: true, url: await this.branding.uploadLogo(id, file) };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: error instanceof Error ? error.message : "Failed to upload logo" }, 500);
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
