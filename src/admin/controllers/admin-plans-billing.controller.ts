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
import { AuditService } from "../../audit/audit.service";
import { AdminService } from "../admin.service";
import {
  AdminCreatePlanDto as CreatePlanDto, UpdatePlanDto, CancelPendingBillingDto,
} from "../dto";
import { PolarService } from "../../billing/polar.service";

@ApiTags("Admin Plans & Billing")
@ApiCookieAuth("pryrox_session")
@UseGuards(SessionGuard, RequirePlatformAdminGuard)
@Controller("admin")
export class AdminPlansBillingController {
  constructor(
    private readonly admin: AdminService,
    private readonly audit: AuditService,
    private readonly polar: PolarService,
  ) {}

  // --- Plans ---

  @Get("plans")
  @ApiOperation({ summary: "List all subscription plans" })
  async listPlans() {
    try {
      return await this.admin.listPlans();
    } catch {
      throw new HttpException({ error: "Failed to fetch plans" }, 500);
    }
  }

  @Post("plans")
  @ApiOperation({ summary: "Create a subscription plan" })
  @ApiBody({ type: CreatePlanDto })
  async createPlan(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>, @Req() req: Request) {
    try {
      const result = await this.admin.createPlan(body);
      await this.auditWrite(user.id, null, "INSERT", "subscription_plans", result.plan?.id, null, body, req);
      return result;
    } catch (error: unknown) {
      const err = error as { status?: number; error?: string };
      throw new HttpException(
        { success: false, error: err.error ?? "Failed to create plan" },
        err.status ?? 500,
      );
    }
  }

  @Put("plans/:id")
  @ApiOperation({ summary: "Update a subscription plan" })
  @ApiParam({ name: "id" })
  async updatePlan(@Param("id") id: string, @CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>, @Req() req: Request) {
    try {
      const result = await this.admin.updatePlan(id, body);
      await this.auditWrite(user.id, null, "UPDATE", "subscription_plans", id, null, body, req);
      return result;
    } catch (error: unknown) {
      const err = error as { status?: number; error?: string };
      throw new HttpException(
        { success: false, error: err.error ?? "Failed to update plan" },
        err.status ?? 500,
      );
    }
  }

  @Delete("plans/:id")
  @ApiOperation({ summary: "Delete a subscription plan" })
  async deletePlan(@Param("id") id: string) {
    try {
      return await this.admin.deletePlan(id);
    } catch {
      throw new HttpException({ error: "Failed to delete plan" }, 500);
    }
  }

  // --- Polar integration ---

  @Get("polar/products")
  @ApiOperation({ summary: "List all products in the connected Polar account" })
  async listPolarProducts() {
    try {
      return await this.polar.listProducts();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const msg = error instanceof Error ? error.message : "Failed to list Polar products";
      throw new HttpException({ error: msg }, 500);
    }
  }

  @Post("polar/sync-plan/:id")
  @ApiOperation({ summary: "Force-sync a subscription plan to Polar and save the polar_product_id" })
  @ApiParam({ name: "id", description: "Subscription plan ID" })
  async syncPlanToPolar(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { polarProductId?: string },
    @Req() req: Request,
  ) {
    try {
      const result = await this.admin.syncPlanToPolar(id, body.polarProductId);
      await this.auditWrite(user.id, null, "UPDATE", "subscription_plans", id, null, { polar_sync: true, polarProductId: result.polarProductId }, req);
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const msg = error instanceof Error ? error.message : "Polar sync failed";
      throw new HttpException({ error: msg }, 500);
    }
  }

  // --- Billing ---

  @Get("billing")
  @ApiOperation({ summary: "Get billing overview" })
  async getBilling() {
    try {
      return await this.admin.getBilling();
    } catch {
      throw new HttpException({ error: "Failed to fetch billing data" }, 500);
    }
  }

  @Post("billing/cancel-pending")
  @ApiOperation({ summary: "Cancel pending billing items" })
  @ApiBody({ type: CancelPendingBillingDto })
  async cancelPending(@Body() body: CancelPendingBillingDto) {
    try {
      return await this.admin.cancelPendingBilling(body);
    } catch (error: unknown) {
      const err = error as { status?: number; error?: string };
      throw new HttpException(
        { error: err.error ?? "Cancel failed" },
        err.status ?? 500,
      );
    }
  }

  // --- Transactions ---

  @Get("transactions")
  @ApiOperation({ summary: "List admin transactions" })
  async listTransactions() {
    try {
      return await this.admin.listTransactions();
    } catch {
      throw new HttpException({ error: "Failed to fetch transactions" }, 500);
    }
  }

  // --- Reports summary ---

  @Get("reports-summary")
  @ApiOperation({ summary: "Get reports summary" })
  async getReportsSummary() {
    try {
      return await this.admin.getReportsSummary();
    } catch {
      throw new HttpException({ error: "Failed to load reports summary" }, 500);
    }
  }

  @Get("reports/summary")
  @ApiOperation({ summary: "Get reports summary (alt path)" })
  async getReportsSummaryAlt() {
    try {
      return await this.admin.getReportsSummary();
    } catch {
      throw new HttpException({ error: "Failed to load reports summary" }, 500);
    }
  }

  @Post("reports")
  @HttpCode(200)
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "Upload an admin report" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: { type: "object", properties: { file: { type: "string", format: "binary" }, name: { type: "string" }, description: { type: "string" }, category: { type: "string" } } } })
  async uploadReport(@UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string } | undefined) {
    try {
      if (!file) throw new HttpException({ error: "Missing file field" }, 400);
      const result = await this.admin.uploadReport({ buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype });
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const err = error as { status?: number; error?: string };
      throw new HttpException({ error: err.error ?? "Upload failed" }, err.status ?? 500);
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
