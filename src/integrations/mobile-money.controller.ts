import { Body, Controller, HttpException, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextService } from "../tenant/tenant-context.service";
import { MobileMoneyPaymentDto, MobileMoneyPaymentResponseDto } from "./dto";
import { IntegrationsMobileMoneyService } from "./integrations-mobile-money.service";

@ApiTags("Mobile Money")
@ApiCookieAuth("pryrox_session")
@UseGuards(SessionGuard)
@Controller("integrations/mobile-money")
export class MobileMoneyController {
  constructor(
    private readonly service: IntegrationsMobileMoneyService,
    private readonly tenant: TenantContextService,
  ) {}

  @Post()
  @ApiOperation({ summary: "Simulate a mobile money payment" })
  @ApiOkResponse({ type: MobileMoneyPaymentResponseDto })
  async processPayment(@CurrentUser() user: AuthUser, @Body() body: MobileMoneyPaymentDto) {
    try {
      await this.tenant.requirePharmacyId(user.id);

      if (!body.amount || !body.phone || !body.provider) {
        throw new HttpException({ error: "amount, phone, and provider are required" }, 400);
      }

      return await this.service.processPayment({
        amount: body.amount,
        phone: body.phone,
        provider: body.provider,
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error && typeof error === "object" && "status" in error) {
        const thrown = error as { error: string; status: number };
        throw new HttpException({ error: thrown.error }, thrown.status);
      }
      throw new HttpException({ error: "Mobile money payment failed" }, 500);
    }
  }
}
