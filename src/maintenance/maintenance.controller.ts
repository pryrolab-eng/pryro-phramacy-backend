import { Body, Controller, Get, HttpException, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { MaintenanceService } from "./maintenance.service";
import { SessionGuard } from "../auth/session.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

@ApiTags("Maintenance")
@ApiCookieAuth("pryrox_session")
@Controller("maintenance")
export class MaintenanceController {
  constructor(
    private readonly maintenance: MaintenanceService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("notify")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Queue maintenance notification emails to all users (admin only)" })
  async notify(
    @CurrentUser() user: AuthUser,
    @Body() body: { message: string; scheduledAt: string },
  ) {
    const isAdmin = await this.prisma.public_users.findUnique({
      where: { id: user.id },
      select: { is_platform_admin: true },
    });
    if (!isAdmin?.is_platform_admin) {
      throw new HttpException({ error: "Forbidden" }, 403);
    }
    if (!body.message?.trim() || !body.scheduledAt?.trim()) {
      throw new HttpException({ error: "message and scheduledAt are required" }, 400);
    }
    return this.maintenance.dispatchMaintenanceNotifications({
      message: body.message.trim(),
      scheduledAt: body.scheduledAt.trim(),
    });
  }

  @Get("queue-stats")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Get maintenance notification queue statistics" })
  async queueStats(@CurrentUser() user: AuthUser) {
    const isAdmin = await this.prisma.public_users.findUnique({
      where: { id: user.id },
      select: { is_platform_admin: true },
    });
    if (!isAdmin?.is_platform_admin) {
      throw new HttpException({ error: "Forbidden" }, 403);
    }
    return this.maintenance.getQueueStats();
  }
}
