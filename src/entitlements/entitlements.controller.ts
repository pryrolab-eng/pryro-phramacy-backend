import { Controller, Get, HttpException, Injectable, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { AuthUser } from "../auth/auth.types";
import { ErrorResponseDto } from "../common/dto";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { EntitlementsResponseDto } from "./dto";
import { EntitlementsService } from "./entitlements.service";

@Injectable()
export class EntitlementsControllerSupport {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async get(userId: string) {
    const pharmacyId = await this.tenant.resolvePharmacyId(userId);
    if (!pharmacyId) {
      const profile = await this.prisma.public_users.findUnique({
        where: { id: userId },
        select: { is_platform_admin: true },
      });
      if (profile?.is_platform_admin) {
        return this.entitlements.buildPlatformAdminSnapshot();
      }
      throw new HttpException({ error: "Pharmacy not found" }, 404);
    }
    return this.entitlements.toSnapshot(
      await this.entitlements.resolvePharmacyEntitlements(pharmacyId),
    );
  }
}

@ApiTags("Entitlements")
@ApiCookieAuth("pryrox_session")
@Controller("entitlements")
@UseGuards(SessionGuard)
export class EntitlementsController {
  constructor(private readonly support: EntitlementsControllerSupport) {}

  @Get()
  @ApiOperation({ summary: "Get effective subscription entitlements", description: "Returns the active pharmacy's plan, access state, enabled features, limits, usage, route mapping, and feature labels. Platform administrators without a pharmacy receive an unrestricted platform snapshot." })
  @ApiResponse({ status: 200, description: "The effective entitlement snapshot was loaded.", type: EntitlementsResponseDto })
  @ApiResponse({ status: 401, description: "A valid session cookie was not supplied.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The user has no active pharmacy and is not a platform administrator.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The entitlement snapshot could not be loaded.", type: ErrorResponseDto })
  async get(@CurrentUser() user: AuthUser) {
    try {
      return await this.support.get(user.id);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("GET /api/entitlements", error);
      throw new HttpException({ error: "Failed to load entitlements" }, 500);
    }
  }
}
