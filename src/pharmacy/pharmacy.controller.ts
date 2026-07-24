import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { Request } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { ErrorResponseDto } from "../common/dto";
import { EntitlementError } from "../entitlements/entitlement.error";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import {
  ActivityLogsResponseDto,
  CombinedDashboardDto,
  DashboardStatsDto,
  InvoiceTemplateDto,
  InvoiceTemplateUpdateResponseDto,
  LogoUploadDto,
  LogoUploadResponseDto,
  MedicationCoveragePatchDto,
  MedicationCoveragePatchResponseDto,
  PharmacyBrandingDto,
  PharmacySettingsDto,
  SeedDemoResponseDto,
  SuccessResponseDto,
  UpdatePharmacyBrandingDto,
  UpdatePharmacySettingsDto,
} from "./dto";
import {
  PharmacyBrandingService,
  type UploadedLogoFile,
} from "./pharmacy-branding.service";
import { DEFAULT_INVOICE_TEMPLATE } from "./models";
import { PharmacyService } from "./pharmacy.service";

function requestMetadata(request: Request) {
  const forwarded = request.headers["x-forwarded-for"];
  return {
    ipAddress:
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)
        ?.split(",")[0]
        ?.trim() || undefined,
    userAgent: request.headers["user-agent"],
  };
}

@ApiTags("Pharmacy")
@ApiCookieAuth("pryrox_session")
@Controller("pharmacy")
export class PharmacyController {
  constructor(
    private readonly service: PharmacyService,
    private readonly branding: PharmacyBrandingService,
    private readonly tenant: TenantContextService,
    private readonly auth: AuthService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get("dashboard")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Get pharmacy dashboard statistics" })
  @ApiQuery({ name: "branchId", required: false, type: String })
  @ApiQuery({ name: "from", required: false, type: String, format: "date-time" })
  @ApiQuery({ name: "to", required: false, type: String, format: "date-time" })
  @ApiResponse({ status: 200, type: DashboardStatsDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async dashboard(
    @CurrentUser() user: AuthUser,
    @Query("branchId") rawBranchId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const branchId =
        rawBranchId && rawBranchId !== "all" ? rawBranchId : undefined;
      return await this.service.dashboardStats(
        pharmacyId,
        branchId,
        this.service.reportRange(from, to),
      );
    } catch (error) {
      console.error("GET /api/pharmacy/dashboard", error);
      return {
        totalProducts: 0,
        lowStockItems: 0,
        todaySales: 0,
        monthlyRevenue: 0,
        totalCustomers: 0,
        activeStaff: 0,
        pendingOrders: 0,
        expiringProducts: 0,
      };
    }
  }

  @Get("dashboard/legacy")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Legacy dashboard — stats, alerts and recent sales" })
  @ApiResponse({ status: 200, schema: { type: "object" } })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async legacyDashboard(@CurrentUser() user: AuthUser) {
    try {
      return await this.service.legacyDashboard(
        await this.tenant.requirePharmacyId(user.id),
      );
    } catch (error) {
      console.error("GET /api/pharmacy/dashboard/legacy", error);
      return { stats: {}, alerts: [], recentSales: [] };
    }
  }

  @Get("dashboard/combined")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Get the combined pharmacy dashboard" })
  @ApiQuery({ name: "branchId", required: false, type: String })
  @ApiQuery({ name: "from", required: false, type: String, format: "date-time" })
  @ApiQuery({ name: "to", required: false, type: String, format: "date-time" })
  @ApiResponse({ status: 200, type: CombinedDashboardDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async combinedDashboard(
    @CurrentUser() user: AuthUser,
    @Query("branchId") rawBranchId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const branchId =
        rawBranchId && rawBranchId !== "all" ? rawBranchId : undefined;
      return await this.service.combinedDashboard(
        pharmacyId,
        branchId,
        this.service.reportRange(from, to),
      );
    } catch (error) {
      console.error("GET /api/pharmacy/dashboard/combined", error);
      return this.service.emptyCombinedDashboard();
    }
  }

  @Get("settings")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Get pharmacy business settings" })
  @ApiResponse({ status: 200, type: PharmacySettingsDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({ status: 500, type: ErrorResponseDto })
  async settings(@CurrentUser() user: AuthUser) {
    try {
      const result = await this.service.settings(
        await this.tenant.requirePharmacyId(user.id),
      );
      if (!result) throw new HttpException({ error: "Pharmacy not found" }, 404);
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("Settings fetch error:", error);
      throw new HttpException({ error: "Failed to fetch settings" }, 500);
    }
  }

  @Put("settings")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Update pharmacy business settings" })
  @ApiBody({ type: UpdatePharmacySettingsDto })
  @ApiResponse({ status: 200, type: SuccessResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 500, type: ErrorResponseDto })
  async updateSettings(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      if (!(await this.service.isOwner(user.id, pharmacyId))) {
        throw new HttpException(
          { error: "Only the pharmacy owner can update business settings" },
          403,
        );
      }
      if (!body.name || !body.phone || !body.email) {
        throw new HttpException({ error: "Missing required fields" }, 400);
      }
      await this.service.updateSettings(
        pharmacyId,
        user.id,
        body,
        requestMetadata(request),
      );
      return { success: true };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("Settings update error:", error);
      throw new HttpException({ error: "Failed to update settings" }, 500);
    }
  }

  @Get("branding")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Get pharmacy branding" })
  @ApiResponse({ status: 200, type: PharmacyBrandingDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({ status: 500, type: ErrorResponseDto })
  async getBranding(@CurrentUser() user: AuthUser) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      try {
        const entitlement =
          await this.entitlements.resolvePharmacyEntitlements(pharmacyId);
        if (!entitlement.featureKeys.includes("customization")) {
          return this.branding.defaultBranding();
        }
      } catch (error) {
        console.error("GET branding: entitlements check failed", error);
        return this.branding.defaultBranding();
      }
      const branding = await this.branding.load(pharmacyId);
      if (!branding) throw new HttpException({ error: "Pharmacy not found" }, 404);
      return branding;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("Branding fetch error:", error);
      throw new HttpException({ error: "Failed to fetch branding" }, 500);
    }
  }

  @Put("branding")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Update pharmacy branding" })
  @ApiBody({ type: UpdatePharmacyBrandingDto })
  @ApiResponse({ status: 200, type: SuccessResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 500, type: ErrorResponseDto })
  async updateBranding(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      await this.assertWhiteLabelEnabled();
      await this.entitlements.assertEntitlement({
        pharmacyId,
        feature: "customization",
      });
      await this.branding.save(
        pharmacyId,
        body as Partial<{
          platformName: string;
          logoUrl: string;
          primaryColor: string;
          customDomain: string;
        }>,
      );
      return { success: true };
    } catch (error) {
      if (error instanceof HttpException || error instanceof EntitlementError) {
        throw error;
      }
      console.error("Branding update error:", error);
      throw new HttpException({ error: "Failed to update branding" }, 500);
    }
  }

  @Post("branding/upload")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "Upload and persist a pharmacy logo" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ type: LogoUploadDto })
  @ApiResponse({ status: 200, type: LogoUploadResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 500, type: ErrorResponseDto })
  async uploadLogo(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedLogoFile | undefined,
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      await this.assertWhiteLabelEnabled();
      await this.entitlements.assertEntitlement({
        pharmacyId,
        feature: "customization",
      });
      if (!file) throw new HttpException({ error: "No file provided" }, 400);
      return {
        success: true,
        url: await this.branding.uploadLogo(pharmacyId, file),
      };
    } catch (error) {
      if (error instanceof HttpException || error instanceof EntitlementError) {
        throw error;
      }
      console.error("Logo upload error:", error);
      throw new HttpException(
        {
          error:
            error instanceof Error ? error.message : "Failed to upload logo",
        },
        500,
      );
    }
  }

  @Get("invoice-template")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Get the pharmacy invoice template" })
  @ApiResponse({ status: 200, type: InvoiceTemplateDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async invoiceTemplate(@CurrentUser() user: AuthUser) {
    try {
      return await this.service.invoiceTemplate(
        await this.tenant.requirePharmacyId(user.id),
      );
    } catch (error) {
      console.error("GET /api/pharmacy/invoice-template", error);
      return { ...DEFAULT_INVOICE_TEMPLATE };
    }
  }

  @Put("invoice-template")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Update the pharmacy invoice template" })
  @ApiBody({ type: InvoiceTemplateDto })
  @ApiResponse({ status: 200, type: InvoiceTemplateUpdateResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 500, type: ErrorResponseDto })
  async updateInvoiceTemplate(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      if (!(await this.service.isOwner(user.id, pharmacyId))) {
        throw new HttpException(
          { error: "Only the pharmacy owner can update invoice templates" },
          403,
        );
      }
      return {
        success: true,
        template: await this.service.saveInvoiceTemplate(pharmacyId, body),
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("PUT /api/pharmacy/invoice-template", error);
      throw new HttpException(
        { success: false, error: "Failed to update template" },
        500,
      );
    }
  }

  @Get("activity-logs")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "List pharmacy activity logs" })
  @ApiQuery({ name: "limit", required: false, type: Number, example: 25 })
  @ApiQuery({ name: "offset", required: false, type: Number, example: 0 })
  @ApiQuery({ name: "action", required: false, type: String })
  @ApiQuery({ name: "table", required: false, type: String })
  @ApiQuery({ name: "userId", required: false, type: String })
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ApiQuery({ name: "facets", required: false, enum: ["1"] })
  @ApiResponse({ status: 200, type: ActivityLogsResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ActivityLogsResponseDto })
  @ApiResponse({ status: 500, type: ActivityLogsResponseDto })
  async activityLogs(
    @CurrentUser() user: AuthUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    try {
      await this.entitlements.assertEntitlement({
        pharmacyId: await this.tenant.requirePharmacyId(user.id),
        feature: "reports.view",
      });
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      if (!(await this.service.platformFlag("enableAuditLogs", true))) {
        throw new HttpException(
          { items: [], total: 0, error: "audit_logs_disabled" },
          403,
        );
      }
      const parsedLimit = parseInt(query.limit ?? "25", 10);
      const parsedOffset = parseInt(query.offset ?? "0", 10);
      return await this.service.activityLogs({
        pharmacyId,
        limit: Number.isFinite(parsedLimit) ? Math.min(parsedLimit, 100) : 25,
        offset: Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0,
        filters: {
          action: query.action,
          table: query.table,
          userId: query.userId,
          search: query.q,
          from: query.from,
          to: query.to,
        },
        includeFacets: query.facets === "1",
      });
    } catch (error) {
      if (error instanceof HttpException || error instanceof EntitlementError) {
        throw error;
      }
      console.error("GET /api/pharmacy/activity-logs", error);
      throw new HttpException(
        { items: [], total: 0, error: "Failed to load activity" },
        500,
      );
    }
  }

  @Get("category-sales")
  @ApiOperation({ summary: "Get pharmacy sales grouped by category" })
  @ApiQuery({ name: "branchId", required: false, type: String })
  @ApiResponse({
    status: 200,
    schema: { type: "array", items: { type: "object" } },
  })
  async categorySales(
    @Req() request: Request,
    @Query("branchId") rawBranchId?: string,
  ) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) return [];
      return await this.service.categorySales(
        await this.tenant.requirePharmacyId(user.id),
        rawBranchId && rawBranchId !== "all" ? rawBranchId : undefined,
      );
    } catch (error) {
      console.error("GET /api/pharmacy/category-sales", error);
      throw new HttpException({ error: "Failed to fetch category sales" }, 500);
    }
  }

  @Get("sales-chart")
  @ApiOperation({ summary: "Get the pharmacy monthly sales chart" })
  @ApiQuery({ name: "branchId", required: false, type: String })
  @ApiResponse({
    status: 200,
    schema: { type: "array", items: { type: "object" } },
  })
  async salesChart(
    @Req() request: Request,
    @Query("branchId") rawBranchId?: string,
  ) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) return [];
      return await this.service.salesChart(
        await this.tenant.requirePharmacyId(user.id),
        rawBranchId && rawBranchId !== "all" ? rawBranchId : undefined,
      );
    } catch (error) {
      console.error("GET /api/pharmacy/sales-chart", error);
      throw new HttpException({ error: "Failed to fetch sales chart" }, 500);
    }
  }

  @Get("inventory-chart")
  @ApiOperation({ summary: "Get the pharmacy inventory chart" })
  @ApiResponse({
    status: 200,
    schema: { type: "array", items: { type: "object" } },
  })
  async inventoryChart(@Req() request: Request) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) return [];
      return await this.service.inventoryChart(
        await this.tenant.requirePharmacyId(user.id),
      );
    } catch (error) {
      console.error("GET /api/pharmacy/inventory-chart", error);
      throw new HttpException({ error: "Failed to fetch inventory chart" }, 500);
    }
  }

  @Get("weekly-sales")
  @ApiOperation({ summary: "Get the pharmacy weekly sales chart" })
  @ApiQuery({ name: "branchId", required: false, type: String })
  @ApiResponse({
    status: 200,
    schema: { type: "array", items: { type: "object" } },
  })
  async weeklySales(
    @Req() request: Request,
    @Query("branchId") rawBranchId?: string,
  ) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) return [];
      return await this.service.weeklySales(
        await this.tenant.requirePharmacyId(user.id),
        rawBranchId && rawBranchId !== "all" ? rawBranchId : undefined,
      );
    } catch (error) {
      console.error("GET /api/pharmacy/weekly-sales", error);
      throw new HttpException({ error: "Failed to fetch weekly sales" }, 500);
    }
  }

  @Get("insurance-covered-medications")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Get medication insurance coverage" })
  @ApiQuery({ name: "medicationId", required: false, type: String })
  @ApiQuery({ name: "providerId", required: false, type: String })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiResponse({ status: 200, schema: { type: "object" } })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({ status: 500, type: ErrorResponseDto })
  async insuranceCoverage(
    @CurrentUser() user: AuthUser,
    @Query("medicationId") rawMedicationId?: string,
    @Query("providerId") rawProviderId?: string,
    @Query("search") rawSearch?: string,
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      await this.entitlements.assertEntitlement({
        pharmacyId,
        feature: "pos.insurance",
      });
      const medicationId = rawMedicationId?.trim();
      const providerId = rawProviderId?.trim();
      if (!medicationId && !providerId) {
        throw new HttpException(
          { error: "providerId or medicationId query parameter is required" },
          400,
        );
      }
      const result = await this.service.medicationCoverage({
        pharmacyId,
        medicationId,
        providerId,
        search: rawSearch?.trim(),
      });
      if (!result) {
        throw new HttpException(
          {
            error: medicationId ? "Medication not found" : "Provider not found",
          },
          404,
        );
      }
      return result;
    } catch (error) {
      if (error instanceof HttpException || error instanceof EntitlementError) {
        throw error;
      }
      console.error(
        "GET /api/pharmacy/insurance-covered-medications",
        error,
      );
      throw new HttpException(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to load medications",
        },
        500,
      );
    }
  }

  @Patch("insurance-covered-medications")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Update medication insurance coverage" })
  @ApiBody({ type: MedicationCoveragePatchDto })
  @ApiResponse({ status: 200, type: MedicationCoveragePatchResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({ status: 500, type: ErrorResponseDto })
  async updateInsuranceCoverage(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      await this.entitlements.assertEntitlement({
        pharmacyId,
        feature: "pos.insurance",
      });
      const medicationId = String(body.medicationId ?? "").trim();
      const providerId = String(body.providerId ?? body.provider ?? "").trim();
      if (!medicationId || !providerId) {
        throw new HttpException(
          { error: "medicationId and providerId are required" },
          400,
        );
      }
      const result = await this.service.updateMedicationCoverage(pharmacyId, body);
      if (result.kind === "medication") {
        throw new HttpException({ error: "Medication not found" }, 404);
      }
      if (result.kind === "provider") {
        throw new HttpException({ error: "Provider not found" }, 404);
      }
      return result.response;
    } catch (error) {
      if (error instanceof HttpException || error instanceof EntitlementError) {
        throw error;
      }
      console.error(
        "PATCH /api/pharmacy/insurance-covered-medications",
        error,
      );
      throw new HttpException(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to update coverage",
        },
        500,
      );
    }
  }

  @Post("seed-demo-data")
  @HttpCode(200)
  @ApiOperation({ summary: "Seed demonstration data for the active pharmacy" })
  @ApiResponse({ status: 200, type: SeedDemoResponseDto })
  @ApiResponse({ status: 401, type: SeedDemoResponseDto })
  @ApiResponse({ status: 403, type: SeedDemoResponseDto })
  @ApiResponse({ status: 500, type: SeedDemoResponseDto })
  async seedDemo(@Req() request: Request) {
    if (
      process.env.NODE_ENV !== "development" &&
      process.env.SEED_DEMO_ENABLED !== "true"
    ) {
      throw new HttpException(
        { success: false, error: "Demo seed is disabled in this environment" },
        403,
      );
    }
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) {
        throw new HttpException(
          { success: false, error: "Unauthorized" },
          401,
        );
      }
      return {
        success: true,
        result: await this.service.seedDemo(
          await this.tenant.requirePharmacyId(user.id),
        ),
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        {
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to seed demo data",
        },
        500,
      );
    }
  }

  private async assertWhiteLabelEnabled() {
    if (!(await this.service.platformFlag("enableWhiteLabel", true))) {
      throw new HttpException(
        {
          error: "White-label customization is disabled for this platform.",
          code: "white_label_disabled",
        },
        403,
      );
    }
  }
}
