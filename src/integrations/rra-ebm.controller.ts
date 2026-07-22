import { Body, Controller, HttpException, Post, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextService } from "../tenant/tenant-context.service";
import { EbmSubmissionDto, EbmSubmissionResponseDto } from "./dto";
import { IntegrationsRraEbmService } from "./integrations-rra-ebm.service";

@ApiTags("RRA EBM")
@ApiCookieAuth("pryrox_session")
@UseGuards(SessionGuard)
@Controller("integrations/rra-ebm")
export class RraEbmController {
  constructor(
    private readonly service: IntegrationsRraEbmService,
    private readonly tenant: TenantContextService,
  ) {}

  @Post()
  @ApiOperation({ summary: "Submit a sale to RRA EBM via VSDC" })
  @ApiOkResponse({ type: EbmSubmissionResponseDto })
  async submit(@CurrentUser() user: AuthUser, @Body() body: EbmSubmissionDto) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);

      const invoice = body.invoice || body.receiptNumber || `RCP-${Date.now()}`;
      const items = Array.isArray(body.items) ? body.items : [];
      const saleId = body.saleId || `manual-${Date.now()}`;

      const normalizedItems = items.map((item) => ({
        name: String(item.name ?? "Item"),
        quantity: Number(item.quantity ?? 1),
        unitPrice: Number(item.price ?? 0),
      }));

      const subtotal = normalizedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

      const submission = await this.service.submitSale({
        pharmacyId,
        saleId,
        receiptNumber: invoice,
        customerName: body.customerName ?? null,
        paymentMethod: body.paymentMethod ?? null,
        subtotal,
        items: normalizedItems,
      });

      if (!submission.ok) {
        const status = submission.mode === "disabled" ? 400 : 502;
        throw new HttpException({ error: submission.error ?? "RRA EBM submission failed", submission }, status);
      }

      return { success: true, submission };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "RRA EBM submission failed" }, 500);
    }
  }
}
