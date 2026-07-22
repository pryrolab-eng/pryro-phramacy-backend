import { Body, Controller, HttpCode, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { AiSafetyService, type SafetyItem } from "./ai-safety.service";
import { AiSafetyCheckDto } from "./dto/ai-chat.dto";

@ApiTags("AI")
@Controller("ai-safety")
export class AiSafetyController {
  constructor(
    private readonly safety: AiSafetyService,
    private readonly auth: AuthService,
    private readonly tenant: TenantContextService,
  ) {}

  /** No auth required — falls back to local rules when unauthenticated. */
  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: "Drug safety check for cart items" })
  async check(@Body() body: AiSafetyCheckDto, @Req() req: Request) {
    const items = body.items ?? [];

    if (!Array.isArray(items) || items.length === 0) {
      return {
        success: true,
        result: {
          interactions: [],
          warnings: ["No items to analyze"],
          recommendations: ["Add items to cart for safety check"],
          severity: "safe",
          aiPowered: false,
        },
      };
    }

    const safeItems: SafetyItem[] = items.map((item) => ({
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Unknown item",
      quantity: typeof item.quantity === "number" ? item.quantity : 1,
    }));

    let pharmacyId: string | null = null;
    try {
      const user = await this.auth.resolveUserFromRequest(req);
      if (user) pharmacyId = await this.tenant.resolvePharmacyId(user.id);
    } catch { /* continue without pharmacy context */ }

    const result = await this.safety.analyzeDrugSafety(safeItems, pharmacyId);
    return { success: true, result };
  }
}
