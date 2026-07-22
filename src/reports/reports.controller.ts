import {
  Controller,
  Get,
  HttpException,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { ErrorResponseDto } from "../common/dto";
import { EntitlementError } from "../entitlements/entitlement.error";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import {
  AuditReportItemDto,
  CombinedReportsResponseDto,
  FinancialReportResponseDto,
  InsuranceClaimsReportResponseDto,
  InventoryReportResponseDto,
  SalesReportResponseDto,
  TaxReportResponseDto,
} from "./dto";
import { ReportsService, type ReportRange } from "./reports.service";

function defaultRange(days = 30): ReportRange {
  return {
    from: new Date(Date.now() - days * 86_400_000).toISOString(),
    to: new Date().toISOString(),
  };
}

@ApiTags("Reports")
@ApiCookieAuth("pryrox_session")
@UseGuards(SessionGuard)
@Controller("reports")
export class ReportsController {
  constructor(
    private readonly service: ReportsService,
    private readonly tenant: TenantContextService,
    private readonly entitlements: EntitlementsService,
  ) {}

  private async scope(
    userId: string,
    branchId?: string,
  ): Promise<{ pharmacyId: string; branchId?: string }> {
    const scope = await this.tenant.resolveRequestBranchScope(
      userId,
      branchId && branchId !== "all" ? branchId : undefined,
    );
    return {
      pharmacyId: scope.pharmacyId,
      branchId: scope.branchId ?? undefined,
    };
  }

  private range(from?: string, to?: string): ReportRange {
    return from && to ? { from, to } : defaultRange();
  }

  private async entitled(pharmacyId: string) {
    await this.entitlements.assertEntitlement({
      pharmacyId,
      feature: "reports.view",
    });
  }

  @Get("sales")
  @ApiOperation({ summary: "Get sales report aggregates" })
  @ApiQuery({ name: "branchId", required: false, type: String })
  @ApiQuery({ name: "from", required: false, type: String, format: "date-time" })
  @ApiQuery({ name: "to", required: false, type: String, format: "date-time" })
  @ApiOkResponse({ type: SalesReportResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  async sales(
    @CurrentUser() user: AuthUser,
    @Query("branchId") branchId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    try {
      const scope = await this.scope(user.id, branchId);
      await this.entitled(scope.pharmacyId);
      return await this.service.salesReport(scope, this.range(from, to));
    } catch (error) {
      if (error instanceof EntitlementError) throw error;
      console.error("GET /api/reports/sales", error);
      return {
        dailySales: [],
        topProducts: [],
        paymentBreakdown: [],
        totalSales: 0,
        totalOrders: 0,
        activeCustomers: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  @Get("inventory")
  @ApiOperation({ summary: "Get inventory alert trends" })
  @ApiOkResponse({ type: InventoryReportResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  async inventory(@CurrentUser() user: AuthUser) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      await this.entitled(pharmacyId);
      return await this.service.inventoryReport(pharmacyId);
    } catch (error) {
      if (error instanceof EntitlementError) throw error;
      console.error("GET /api/reports/inventory", error);
      return { inventoryAlerts: [] };
    }
  }

  @Get("financial")
  @ApiOperation({ summary: "Get financial performance report" })
  @ApiQuery({ name: "branchId", required: false, type: String })
  @ApiQuery({ name: "from", required: false, type: String, format: "date-time" })
  @ApiQuery({ name: "to", required: false, type: String, format: "date-time" })
  @ApiOkResponse({ type: FinancialReportResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 500, type: ErrorResponseDto })
  async financial(
    @CurrentUser() user: AuthUser,
    @Query("branchId") branchId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    try {
      const scope = await this.scope(user.id, branchId);
      await this.entitled(scope.pharmacyId);
      return await this.service.financialReport(scope, this.range(from, to));
    } catch (error) {
      if (error instanceof EntitlementError) throw error;
      console.error("GET /api/reports/financial", error);
      throw new HttpException({ error: "Failed to build financial report" }, 500);
    }
  }

  @Get("tax")
  @ApiOperation({ summary: "Get VAT and tax transaction report" })
  @ApiQuery({ name: "branchId", required: false, type: String })
  @ApiQuery({ name: "from", required: false, type: String, format: "date-time" })
  @ApiQuery({ name: "to", required: false, type: String, format: "date-time" })
  @ApiOkResponse({ type: TaxReportResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 500, type: ErrorResponseDto })
  async tax(
    @CurrentUser() user: AuthUser,
    @Query("branchId") branchId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    try {
      const scope = await this.scope(user.id, branchId);
      await this.entitled(scope.pharmacyId);
      return await this.service.taxReport(scope, this.range(from, to));
    } catch (error) {
      if (error instanceof EntitlementError) throw error;
      console.error("GET /api/reports/tax", error);
      throw new HttpException({ error: "Failed to build tax report" }, 500);
    }
  }

  @Get("audit")
  @ApiOperation({ summary: "Get the latest pharmacy audit log entries" })
  @ApiOkResponse({ type: AuditReportItemDto, isArray: true })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 500, type: ErrorResponseDto })
  async audit(@CurrentUser() user: AuthUser) {
    try {
      if (!(await this.service.auditLoggingEnabled())) {
        throw new HttpException(
          {
            error: "audit_logs_disabled",
            message: "Platform audit logging is disabled in Admin → Settings.",
          },
          403,
        );
      }
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      await this.entitled(pharmacyId);
      return await this.service.auditReport(pharmacyId);
    } catch (error) {
      if (error instanceof HttpException || error instanceof EntitlementError) {
        throw error;
      }
      console.error("GET /api/reports/audit", error);
      throw new HttpException({ error: "Failed to fetch audit log" }, 500);
    }
  }

  @Get("insurance-claims")
  @ApiOperation({ summary: "Get monthly insurance claims report" })
  @ApiQuery({ name: "month", required: false, type: Number, minimum: 1, maximum: 12 })
  @ApiQuery({ name: "year", required: false, type: Number })
  @ApiQuery({ name: "providerId", required: false, type: String })
  @ApiQuery({ name: "provider", required: false, type: String })
  @ApiOkResponse({ type: InsuranceClaimsReportResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  @ApiResponse({ status: 500, type: ErrorResponseDto })
  async insuranceClaims(
    @CurrentUser() user: AuthUser,
    @Query("month") monthParam?: string,
    @Query("year") yearParam?: string,
    @Query("providerId") providerIdParam?: string,
    @Query("provider") providerNameParam?: string,
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      await this.entitled(pharmacyId);
      const now = new Date();
      const parsedMonth =
        parseInt(monthParam ?? String(now.getMonth() + 1), 10) ||
        now.getMonth() + 1;
      const year =
        parseInt(yearParam ?? String(now.getFullYear()), 10) ||
        now.getFullYear();
      return await this.service.insuranceClaimsReport({
        pharmacyId,
        month: Math.min(12, Math.max(1, parsedMonth)),
        year,
        providerId: providerIdParam?.trim() || null,
        providerName: providerNameParam?.trim() || null,
      });
    } catch (error) {
      if (error instanceof EntitlementError) throw error;
      console.error("GET /api/reports/insurance-claims", error);
      throw new HttpException(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to load insurance claims report",
        },
        500,
      );
    }
  }

  @Get("combined")
  @ApiOperation({ summary: "Get combined reports dashboard data" })
  @ApiQuery({ name: "branchId", required: false, type: String })
  @ApiQuery({ name: "from", required: false, type: String, format: "date-time" })
  @ApiQuery({ name: "to", required: false, type: String, format: "date-time" })
  @ApiOkResponse({ type: CombinedReportsResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async combined(
    @CurrentUser() user: AuthUser,
    @Query("branchId") branchId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    try {
      return await this.service.combinedReport(
        await this.scope(user.id, branchId),
        this.range(from, to),
      );
    } catch (error) {
      console.error("GET /api/reports/combined", error);
      return {
        salesReport: { totalSales: 0, totalRevenue: 0, topProducts: [] },
        inventoryReport: { inventoryAlerts: [] },
        categorySales: [],
        dashboardStats: {
          totalProducts: 0,
          lowStockItems: 0,
          todaySales: 0,
          monthlyRevenue: 0,
          totalCustomers: 0,
          activeStaff: 0,
          pendingOrders: 0,
          expiringProducts: 0,
        },
      };
    }
  }
}
