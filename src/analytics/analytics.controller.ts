import { Controller, Get, HttpException, UseGuards } from "@nestjs/common";
import {
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
import { TenantContextService } from "../tenant/tenant-context.service";
import { AnalyticsResponseDto } from "./dto";
import { AnalyticsService } from "./analytics.service";

@ApiTags("Analytics")
@ApiCookieAuth("pryrox_session")
@UseGuards(SessionGuard)
@Controller("analytics")
export class AnalyticsController {
  constructor(
    private readonly service: AnalyticsService,
    private readonly tenant: TenantContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get pharmacy analytics dashboard" })
  @ApiOkResponse({ type: AnalyticsResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async dashboard(@CurrentUser() user: AuthUser) {
    try {
      return await this.service.dashboard(
        await this.tenant.requirePharmacyId(user.id),
      );
    } catch (error) {
      console.error("GET /api/analytics", error);
      throw new HttpException({ error: "Failed to fetch analytics" }, 500);
    }
  }
}
