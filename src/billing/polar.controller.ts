import { Body, Controller, Get, HttpException, Post, Query, Req, UseGuards, Headers } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { ErrorResponseDto } from "../common/dto";
import { TenantContextService } from "../tenant/tenant-context.service";
import { CheckoutResponseDto, CreateCheckoutDto, PolarConfigDto } from "./dto";
import { PolarService } from "./polar.service";
import { isValidEmail, normalizeEmail, INVALID_EMAIL_MESSAGE } from "./email-validation";

@ApiTags("Polar")
@Controller()
export class PolarController {
  constructor(
    private readonly service: PolarService,
    private readonly tenant: TenantContextService,
  ) {}

  @Get("polar/config")
  @ApiOperation({ summary: "Check if Polar card payments are configured" })
  @ApiOkResponse({ type: PolarConfigDto })
  getConfig() {
    return this.service.getConfig();
  }

  @Post("polar/checkout")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Create a Polar checkout session" })
  @ApiOkResponse({ type: CheckoutResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async createCheckout(@CurrentUser() user: AuthUser, @Body() body: CreateCheckoutDto) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const customerEmailRaw = body.customerEmail || user.email || "";
      const customerEmail = normalizeEmail(customerEmailRaw);
      if (!customerEmail) throw new HttpException({ error: INVALID_EMAIL_MESSAGE }, 400);
      if (!isValidEmail(customerEmail)) throw new HttpException({ error: INVALID_EMAIL_MESSAGE }, 400);
      return await this.service.createCheckout({
        pharmacyId,
        userId: user.id,
        planId: body.planId,
        subscriptionId: body.subscriptionId,
        returnContext: body.returnContext,
        customerEmail,
        customerName: body.customerName || "Pharmacy customer",
        customerPhone: body.customerPhone,
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const message = error instanceof Error ? error.message : "Checkout failed";
      throw new HttpException({ error: message }, 500);
    }
  }

  @Get("polar/status")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Check payment/checkout status after Polar redirect" })
  async checkStatus(@CurrentUser() user: AuthUser, @Query("checkoutId") checkoutId: string) {
    if (!checkoutId) throw new HttpException({ error: "checkoutId is required" }, 400);
    try {
      return await this.service.checkStatus(checkoutId, user.id);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Status check failed" }, 500);
    }
  }

  @Post("polar/webhook")
  @ApiOperation({ summary: "Polar webhook receiver" })
  async webhook(@Req() req: Request) {
    const body = await (req as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
    const headers: Record<string, string> = {};
    Object.entries(req.headers).forEach(([key, value]) => {
      headers[key.toLowerCase()] = String(value);
    });
    return await this.service.handleWebhook(body, headers);
  }
}
