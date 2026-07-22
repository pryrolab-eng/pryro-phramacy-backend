import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { ErrorResponseDto } from "../common/dto";
import { EntitlementsService } from "../entitlements/entitlements.service";
import {
  PHARMACY_PERMISSIONS,
  PharmacyPermissionService,
} from "../tenant/pharmacy-permission.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import {
  CreatePharmacistDto,
  CreatePharmacistResponseDto,
  PendingPrescriptionDto,
  PharmacistActivityDto,
  PharmacistChartPointDto,
  PharmacistStatsDto,
  ProcessPrescriptionDto,
  SuccessDto,
  TrackActivityDto,
} from "./dto";
import { PharmacistService } from "./pharmacist.service";

@ApiTags("Pharmacist")
@ApiCookieAuth("pryrox_session")
@UseGuards(SessionGuard)
@Controller("pharmacist")
export class PharmacistController {
  constructor(
    private readonly service: PharmacistService,
    private readonly tenant: TenantContextService,
    private readonly permission: PharmacyPermissionService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get("dashboard")
  @ApiOperation({ summary: "Get pharmacist dashboard statistics" })
  @ApiOkResponse({ type: PharmacistStatsDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async dashboard(@CurrentUser() user: AuthUser) {
    try {
      return await this.service.dashboardStats(
        await this.tenant.requirePharmacyId(user.id),
      );
    } catch (error) {
      console.error("GET /api/pharmacist/dashboard", error);
      return {
        prescriptionsToday: 0,
        customersServed: 0,
        averageWaitTime: 8,
        completedSales: 0,
        pendingPrescriptions: 0,
        consultationsGiven: 0,
        inventoryChecks: 0,
        alertsHandled: 0,
      };
    }
  }

  @Get("prescriptions")
  @ApiOperation({ summary: "List pending pharmacist prescriptions" })
  @ApiOkResponse({ type: [PendingPrescriptionDto] })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async prescriptions(@CurrentUser() user: AuthUser) {
    try {
      return await this.service.pendingPrescriptions(
        await this.tenant.requirePharmacyId(user.id),
      );
    } catch (error) {
      console.error("GET /api/pharmacist/prescriptions", error);
      throw new HttpException(
        {
          error:
            error instanceof Error ? error.message : "Failed to fetch prescriptions",
        },
        500,
      );
    }
  }

  @Post("prescriptions")
  @HttpCode(200)
  @ApiOperation({ summary: "Process a prescription (start / dispense)" })
  @ApiBody({ type: ProcessPrescriptionDto })
  @ApiOkResponse({ type: SuccessDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async processPrescription(
    @CurrentUser() user: AuthUser,
    @Body() body: ProcessPrescriptionDto,
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const result = await this.service.processPrescription(
        body.prescriptionId,
        body.action,
        pharmacyId,
      );
      if (!result) {
        throw new HttpException({ error: "Prescription not found" }, 404);
      }
      return { success: true };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("POST /api/pharmacist/prescriptions", error);
      throw new HttpException(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to process prescription",
        },
        500,
      );
    }
  }

  @Get("chart-data")
  @ApiOperation({ summary: "Get hourly pharmacist chart data (9am–5pm)" })
  @ApiOkResponse({ type: [PharmacistChartPointDto] })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async chartData(@CurrentUser() user: AuthUser) {
    try {
      return await this.service.chartData(
        await this.tenant.requirePharmacyId(user.id),
      );
    } catch (error) {
      console.error("GET /api/pharmacist/chart-data", error);
      throw new HttpException({ error: "Failed to fetch chart data" }, 500);
    }
  }

  @Get("activities")
  @ApiOperation({ summary: "Get recent pharmacist activities" })
  @ApiOkResponse({ type: [PharmacistActivityDto] })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async activities(@CurrentUser() user: AuthUser) {
    try {
      return await this.service.recentActivities(
        await this.tenant.requirePharmacyId(user.id),
      );
    } catch (error) {
      console.error("GET /api/pharmacist/activities", error);
      throw new HttpException({ error: "Failed to fetch activities" }, 500);
    }
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: "Invite a pharmacy staff member (pharmacist)" })
  @ApiBody({ type: CreatePharmacistDto })
  @ApiOkResponse({ type: CreatePharmacistResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreatePharmacistDto,
  ) {
    try {
      await this.permission.requirePharmacyPermission(
        user.id,
        PHARMACY_PERMISSIONS.staffManage,
      );
      await this.entitlements.assertEntitlement({
        pharmacyId: body.pharmacy_id,
        feature: "staff.invite",
        limit: "users",
      });
      return await this.service.inviteStaff({
        pharmacyId: body.pharmacy_id,
        pharmacyName: body.pharmacy_name || "",
        email: body.email.trim().toLowerCase(),
        fullName: body.full_name.trim(),
        phone: body.phone,
        role: body.role || "staff",
        password: body.password,
        invitedByUserId: user.id,
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("POST /api/pharmacist", error);
      throw new HttpException(
        {
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to create pharmacist",
        },
        500,
      );
    }
  }

  @Post("track-activity")
  @HttpCode(200)
  @ApiOperation({ summary: "Track pharmacist activity (audit stub)" })
  @ApiBody({ type: TrackActivityDto })
  @ApiOkResponse({ type: SuccessDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async trackActivity() {
    return { success: true };
  }
}
