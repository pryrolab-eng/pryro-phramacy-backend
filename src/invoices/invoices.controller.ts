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
import { BillingHistoryResponseDto } from "./dto";
import { InvoicesService } from "./invoices.service";

@ApiTags("Invoices")
@ApiCookieAuth("pryrox_session")
@UseGuards(SessionGuard)
@Controller("invoices")
export class InvoicesController {
  constructor(
    private readonly service: InvoicesService,
    private readonly tenant: TenantContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get pharmacy billing history" })
  @ApiOkResponse({ type: BillingHistoryResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async billingHistory(@CurrentUser() user: AuthUser) {
    try {
      return await this.service.billingHistory(
        await this.tenant.requirePharmacyId(user.id),
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("GET /api/invoices", error);
      throw new HttpException({ error: "Failed to fetch billing history" }, 500);
    }
  }
}
