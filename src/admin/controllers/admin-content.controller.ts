import {
  Body, Controller, Delete, Get, HttpException,
  Param, Post, Put, Req, UseGuards,
} from "@nestjs/common";
import {
  ApiBody, ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../../auth/current-user.decorator";
import type { AuthUser } from "../../auth/auth.types";
import { SessionGuard } from "../../auth/session.guard";
import { RequirePlatformAdminGuard } from "../guards/require-platform-admin.guard";
import { AuditService } from "../../audit/audit.service";
import { AdminService } from "../admin.service";
import {
  AdminCreateCategoryDto as CreateCategoryDto, AdminUpdateCategoryDto as UpdateCategoryDto,
  CreateInsuranceTemplateDto, UpdateInsuranceTemplateDto,
} from "../dto";

@ApiTags("Admin Content")
@ApiCookieAuth("pryrox_session")
@UseGuards(SessionGuard, RequirePlatformAdminGuard)
@Controller("admin")
export class AdminContentController {
  constructor(
    private readonly admin: AdminService,
    private readonly audit: AuditService,
  ) {}

  // --- Categories ---

  @Get("categories")
  @ApiOperation({ summary: "List global categories" })
  async listCategories() {
    try {
      return await this.admin.listGlobalCategories();
    } catch {
      return [];
    }
  }

  @Post("categories")
  @ApiOperation({ summary: "Create a global category" })
  @ApiBody({ type: CreateCategoryDto })
  async createCategory(@CurrentUser() user: AuthUser, @Body() body: CreateCategoryDto, @Req() req: Request) {
    try {
      const result = await this.admin.createGlobalCategory(body);
      await this.auditWrite(user.id, null, "INSERT", "medication_categories", result.category?.id, null, body, req);
      return result;
    } catch {
      throw new HttpException({ success: false, error: "Failed to add category" }, 500);
    }
  }

  @Put("categories/:id")
  @ApiOperation({ summary: "Update a global category" })
  @ApiParam({ name: "id" })
  async updateCategory(@Param("id") id: string, @CurrentUser() user: AuthUser, @Body() body: UpdateCategoryDto, @Req() req: Request) {
    try {
      const result = await this.admin.updateGlobalCategory(id, body);
      await this.auditWrite(user.id, null, "UPDATE", "medication_categories", id, null, body, req);
      return result;
    } catch {
      throw new HttpException({ success: false, error: "Failed to update category" }, 500);
    }
  }

  @Delete("categories/:id")
  @ApiOperation({ summary: "Delete a global category" })
  @ApiParam({ name: "id" })
  async deleteCategory(@Param("id") id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    try {
      const result = await this.admin.deleteGlobalCategory(id);
      await this.auditWrite(user.id, null, "DELETE", "medication_categories", id, { id }, null, req);
      return result;
    } catch (error: unknown) {
      const err = error as { status?: number; error?: string };
      throw new HttpException(
        { success: false, error: err.error ?? "Failed to delete category" },
        err.status ?? 500,
      );
    }
  }

  // --- Insurance templates ---

  @Get("insurance-templates")
  @ApiOperation({ summary: "List global insurance templates" })
  async listInsuranceTemplates() {
    try {
      return await this.admin.listInsuranceTemplates();
    } catch {
      throw new HttpException({ error: "Failed to fetch templates" }, 500);
    }
  }

  @Post("insurance-templates")
  @ApiOperation({ summary: "Create a global insurance template" })
  @ApiBody({ type: CreateInsuranceTemplateDto })
  async createInsuranceTemplate(@CurrentUser() user: AuthUser, @Body() body: CreateInsuranceTemplateDto, @Req() req: Request) {
    try {
      const result = await this.admin.createInsuranceTemplate(body);
      await this.auditWrite(user.id, null, "INSERT", "insurance_templates", result.template?.id, null, body, req);
      return result;
    } catch (error: unknown) {
      const err = error as { status?: number; error?: string };
      throw new HttpException(
        { error: err.error ?? "Failed to create template" },
        err.status ?? 500,
      );
    }
  }

  @Put("insurance-templates/:id")
  @ApiOperation({ summary: "Update a global insurance template" })
  @ApiParam({ name: "id" })
  async updateInsuranceTemplate(@Param("id") id: string, @CurrentUser() user: AuthUser, @Body() body: UpdateInsuranceTemplateDto, @Req() req: Request) {
    try {
      const result = await this.admin.updateInsuranceTemplate(id, body);
      await this.auditWrite(user.id, null, "UPDATE", "insurance_templates", id, null, body, req);
      return result;
    } catch (error: unknown) {
      const err = error as { status?: number; error?: string };
      throw new HttpException(
        { error: err.error ?? "Failed to update template" },
        err.status ?? 500,
      );
    }
  }

  @Delete("insurance-templates/:id")
  @ApiOperation({ summary: "Delete a global insurance template" })
  @ApiParam({ name: "id" })
  async deleteInsuranceTemplate(@Param("id") id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    try {
      const result = await this.admin.deleteInsuranceTemplate(id);
      await this.auditWrite(user.id, null, "DELETE", "insurance_templates", id, { id }, null, req);
      return result;
    } catch (error: unknown) {
      const err = error as { status?: number; error?: string };
      throw new HttpException(
        { error: err.error ?? "Failed to delete template" },
        err.status ?? 500,
      );
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
