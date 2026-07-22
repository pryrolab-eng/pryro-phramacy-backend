import { Controller, Get, HttpException, Query, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { AuthUser } from "../auth/auth.types";
import { ErrorResponseDto } from "../common/dto";
import { TenantContextService } from "../tenant/tenant-context.service";
import { AlertsService } from "./alerts.service";
import { DashboardAlertDto, StockAlertsResponseDto } from "./dto";

@ApiTags("Alerts")
@ApiCookieAuth("pryrox_session")
@Controller("alerts")
@UseGuards(SessionGuard)
export class AlertsController {
  constructor(
    private readonly service: AlertsService,
    private readonly tenant: TenantContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get dashboard inventory alerts", description: "Returns up to 50 inventory items below 150% of their minimum stock level for the authenticated user's active pharmacy." })
  @ApiResponse({ status: 200, description: "Dashboard alerts were loaded successfully.", type: DashboardAlertDto, isArray: true })
  @ApiResponse({ status: 401, description: "A valid session cookie was not supplied.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The authenticated user has no active pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Dashboard alerts could not be loaded.", type: ErrorResponseDto })
  async get(@CurrentUser() user: AuthUser) {
    try {
      return await this.service.dashboard(await this.tenant.requirePharmacyId(user.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch alerts";
      throw new HttpException({ error: message }, message === "Pharmacy not found" ? 404 : 500);
    }
  }
}

@ApiTags("Stock Alerts")
@Controller("stock-alerts")
export class StockAlertsController {
  constructor(
    private readonly auth: AuthService,
    private readonly service: AlertsService,
    private readonly tenant: TenantContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get stock and expiry alerts", description: "Soft-authenticated endpoint that returns empty alert groups without a session, or categorized inventory alerts for the user's active pharmacy when authenticated." })
  @ApiQuery({ name: "branchId", required: false, type: String, description: "Optional branch UUID to scope inventory. Use all or omit it to include every branch.", example: "cd7a2193-7f09-45bc-b292-900572279c65" })
  @ApiResponse({ status: 200, description: "Stock alert groups were returned. All arrays are empty when no valid session is present.", type: StockAlertsResponseDto })
  @ApiResponse({ status: 404, description: "The authenticated user has no active pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Stock alerts could not be loaded.", type: ErrorResponseDto })
  async get(@Req() request: Request, @Query("branchId") branchId?: string) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) return { all: [], lowStock: [], expiring: [] };
      return await this.service.stock(
        await this.tenant.requirePharmacyId(user.id),
        branchId && branchId !== "all" ? branchId : undefined,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch stock alerts";
      throw new HttpException({ error: message }, message === "Pharmacy not found" ? 404 : 500);
    }
  }
}
