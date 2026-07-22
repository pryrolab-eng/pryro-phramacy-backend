import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { ErrorResponseDto } from "../common/dto";
import { TenantContextService } from "../tenant/tenant-context.service";
import {
  CombinedSalesResponseDto,
  CreateSaleDto,
  CreateSaleResponseDto,
  SalesAnalyticsResponseDto,
  SalesListResponseDto,
} from "./dto";
import { SalesService } from "./sales.service";

const emptyList = {
  sales: [],
  stats: { todayTotal: 0, weekTotal: 0, monthTotal: 0, totalSales: 0 },
};

const emptyAnalytics = {
  weeklySales: [],
  paymentBreakdown: [],
  hourlySales: [],
  monthlyComparison: [],
  customerDistribution: [],
  topCategories: [],
};

@ApiTags("Sales")
@ApiCookieAuth("pryrox_session")
@Controller("sales")
export class SalesController {
  constructor(
    private readonly service: SalesService,
    private readonly auth: AuthService,
    private readonly tenant: TenantContextService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List sales and revenue statistics",
    description:
      "Returns filtered sales plus pharmacy-wide today, seven-day, and thirty-day totals. Missing authentication or lookup failures return an empty success payload.",
  })
  @ApiQuery({ name: "period", required: false, enum: ["today", "week", "month", "all"], description: "Preset date window used when both from and to are not supplied.", example: "month" })
  @ApiQuery({ name: "q", required: false, type: String, description: "Case-insensitive customer-name or payment-method search.", example: "cash" })
  @ApiQuery({ name: "from", required: false, type: String, description: "Inclusive custom range start; used only when to is also supplied.", example: "2026-07-01T00:00:00.000Z", format: "date-time" })
  @ApiQuery({ name: "to", required: false, type: String, description: "Inclusive custom range end; used only when from is also supplied.", example: "2026-07-21T23:59:59.999Z", format: "date-time" })
  @ApiQuery({ name: "limit", required: false, type: Number, description: "Maximum rows, clamped to 1–200 and defaulting to 100.", example: 100 })
  @ApiOkResponse({ description: "Sales and aggregate totals were returned.", type: SalesListResponseDto })
  async list(
    @Req() request: Request,
    @Query() query: Record<string, string | undefined>,
  ) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) return emptyList;
      return await this.service.list(
        await this.tenant.requirePharmacyId(user.id),
        query,
      );
    } catch (error) {
      console.error("GET /api/sales", error);
      return emptyList;
    }
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: "Process a sale",
    description:
      "Creates the sale header, inserts sale items, and subtracts each item quantity from its inventory record.",
  })
  @ApiBody({ required: true, description: "Sale header and optional line items.", type: CreateSaleDto })
  @ApiOkResponse({ description: "The sale was created, or processing failed in the legacy 200 response envelope.", type: CreateSaleResponseDto })
  @ApiResponse({ status: 401, description: "The session is missing or invalid.", type: ErrorResponseDto })
  async create(@Req() request: Request, @Body() body: Record<string, unknown>) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) {
        throw new HttpException(
          { success: false, error: "Unauthorized" },
          401,
        );
      }
      const sale = await this.service.create(
        await this.tenant.requirePharmacyId(user.id),
        body,
      );
      return { success: true, sale };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("Sale error:", error);
      return { success: false, error: "Failed to process sale" };
    }
  }

  @Get("combined")
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: "Get combined sales reporting",
    description:
      "Returns the thirty-day report, six-month chart, weekly category split, and category totals for the requested branch scope. Processing failures return empty report data with status 200.",
  })
  @ApiQuery({ name: "branchId", required: false, type: String, description: "Branch UUID, `all`, or omission to use the session's resolved branch scope.", example: "94e4fb51-76c9-45eb-8597-22f0898c72ec" })
  @ApiOkResponse({ description: "Combined sales reporting data was returned.", type: CombinedSalesResponseDto })
  @ApiResponse({ status: 401, description: "The session is missing or invalid.", type: ErrorResponseDto })
  async combined(
    @CurrentUser() user: AuthUser,
    @Query("branchId") branchId?: string,
  ) {
    try {
      const scope = await this.tenant.resolveRequestBranchScope(
        user.id,
        branchId && branchId !== "all" ? branchId : undefined,
      );
      return await this.service.combined(scope.pharmacyId, scope.branchId);
    } catch (error) {
      console.error("GET /api/sales/combined", error);
      return {
        salesReport: {
          totalSales: 0,
          totalRevenue: 0,
          topProducts: [],
        },
        salesChart: [],
        weeklySales: [],
        categorySales: [],
      };
    }
  }

  @Get("payments")
  @ApiOperation({
    summary: "List recent payment records (legacy)",
    description: "Returns the last 50 sales formatted as payment records.",
  })
  @ApiOkResponse({ description: "Payment records returned.", schema: { type: "array", items: { type: "object" } } })
  async payments(@Req() request: Request) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) return [];
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      return await this.service.payments(pharmacyId);
    } catch (error) {
      console.error("GET /api/sales/payments", error);
      return [];
    }
  }

  @Get("analytics")
  @ApiOperation({
    summary: "Get sales analytics",
    description:
      "Returns weekly, payment, hourly, monthly comparison, customer segment, and category analytics. Missing authentication or failures return empty datasets.",
  })
  @ApiOkResponse({ description: "Sales analytics were returned.", type: SalesAnalyticsResponseDto })
  async analytics(@Req() request: Request) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) return emptyAnalytics;
      return await this.service.analytics(
        await this.tenant.requirePharmacyId(user.id),
      );
    } catch (error) {
      console.error("GET /api/sales/analytics", error);
      return emptyAnalytics;
    }
  }
}
