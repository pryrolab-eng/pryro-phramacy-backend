import { Controller, Get, HttpException, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/session.guard";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { TenantContextService } from "../tenant/tenant-context.service";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "./realtime.service";
import { RealtimeUpdatesResponseDto } from "./dto";

@ApiTags("Realtime")
@ApiCookieAuth("pryrox_session")
@UseGuards(SessionGuard)
@Controller("realtime/updates")
export class RealtimeController {
  constructor(
    private readonly service: RealtimeService,
    private readonly tenant: TenantContextService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Poll for realtime updates (inventory changes, new sales)" })
  @ApiOkResponse({ type: RealtimeUpdatesResponseDto })
  async getUpdates(@CurrentUser() user: AuthUser) {
    try {
      const isPlatformAdmin = await this.prisma.public_users
        .findUnique({ where: { id: user.id }, select: { is_platform_admin: true } })
        .then((r) => r?.is_platform_admin === true);

      if (isPlatformAdmin) return [];

      const pharmacyId = await this.tenant.resolvePharmacyId(user.id);
      if (!pharmacyId) return [];

      return await this.service.getUpdates(pharmacyId);
    } catch (error) {
      return [];
    }
  }
}
