import { Body, Controller, Delete, Get, HttpException, Post, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { ErrorResponseDto } from "../common/dto";
import { TenantContextService } from "../tenant/tenant-context.service";
import { AuditService } from "../audit/audit.service";
import {
  BranchAddonDto, PlanLimitsDto, ScheduleDowngradeDto, SubscriptionUpgradeDto, UpgradeResponseDto,
} from "./dto";
import { SubscriptionService } from "./subscription.service";

@ApiTags("Subscriptions")
@ApiCookieAuth("pryrox_session")
@UseGuards(SessionGuard)
@Controller()
export class SubscriptionsController {
  constructor(
    private readonly service: SubscriptionService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  @Get("subscriptions/plan-limits")
  @ApiOperation({ summary: "Get plan limits and usage for pharmacy" })
  @ApiOkResponse({ type: PlanLimitsDto })
  async getPlanLimits(@CurrentUser() user: AuthUser) {
    try {
      return await this.service.getPlanLimits(await this.tenant.requirePharmacyId(user.id));
    } catch (error) {
      throw new HttpException({ error: "Failed to load plan limits" }, 500);
    }
  }

  @Get("subscriptions/status")
  @ApiOperation({ summary: "Get subscription status" })
  async getStatus(@CurrentUser() user: AuthUser) {
    try {
      return await this.service.getStatus(await this.tenant.requirePharmacyId(user.id));
    } catch (error) {
      throw new HttpException({ error: "Failed to load subscription status" }, 500);
    }
  }

  @Post("subscriptions/upgrade")
  @ApiOperation({ summary: "Upgrade or subscribe to a plan" })
  async upgrade(@CurrentUser() user: AuthUser, @Body() body: SubscriptionUpgradeDto, @Req() req: Request) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const result = await this.service.upgrade(pharmacyId, body.planId, body.paymentTransactionId);
      const sub = result.subscription as { id: string };
      await this.audit.writeAuditLog({
        pharmacyId, userId: user.id, action: "UPDATE", tableName: "subscriptions", recordId: sub?.id,
        newValues: { planId: body.planId, action: "upgrade", requiresPayment: result.subscription.requiresPayment },
        ipAddress: req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim(),
        userAgent: req.headers["user-agent"] ?? undefined,
      });
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Upgrade failed" }, 500);
    }
  }

  @Post("subscriptions/renew")
  @ApiOperation({ summary: "Renew current plan (extends billing period)" })
  async renew(@CurrentUser() user: AuthUser, @Body() body: SubscriptionUpgradeDto, @Req() req: Request) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const result = await this.service.renew(pharmacyId, body.planId, body.paymentTransactionId);
      const sub = result.subscription as { id: string };
      await this.audit.writeAuditLog({
        pharmacyId, userId: user.id, action: "UPDATE", tableName: "subscriptions", recordId: sub?.id,
        newValues: { planId: body.planId, action: "renew", requiresPayment: result.subscription.requiresPayment },
        ipAddress: req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim(),
        userAgent: req.headers["user-agent"] ?? undefined,
      });
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Renewal failed" }, 500);
    }
  }

  @Post("subscriptions/cancel")
  @ApiOperation({ summary: "Cancel subscription auto-renewal (active until expiry)" })
  async cancel(@CurrentUser() user: AuthUser, @Req() req: Request) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const result = await this.service.cancel(pharmacyId);
      await this.audit.writeAuditLog({
        pharmacyId, userId: user.id, action: "UPDATE", tableName: "subscriptions", recordId: result.subscriptionId,
        newValues: { action: "cancel", activeUntil: result.activeUntil },
        ipAddress: req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim(),
        userAgent: req.headers["user-agent"] ?? undefined,
      });
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Cancellation failed" }, 500);
    }
  }

  @Post("subscriptions/schedule-downgrade")
  @ApiOperation({ summary: "Schedule a plan downgrade" })
  async scheduleDowngrade(@CurrentUser() user: AuthUser, @Body() body: ScheduleDowngradeDto) {
    try {
      return await this.service.scheduleDowngrade(await this.tenant.requirePharmacyId(user.id), body.target_plan_id);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to schedule downgrade" }, 500);
    }
  }

  @Get("subscriptions/scheduled-change")
  @ApiOperation({ summary: "Get scheduled subscription change" })
  async getScheduledChange(@CurrentUser() user: AuthUser) {
    try {
      return await this.service.getScheduledChange(await this.tenant.requirePharmacyId(user.id));
    } catch (error) {
      throw new HttpException({ error: "Failed to fetch scheduled change" }, 500);
    }
  }

  @Delete("subscriptions/scheduled-change")
  @ApiOperation({ summary: "Cancel scheduled subscription change" })
  async cancelScheduledChange(@CurrentUser() user: AuthUser) {
    try {
      const result = await this.service.cancelScheduledChange(await this.tenant.requirePharmacyId(user.id));
      if (!result.canceled) throw new HttpException({ error: "No scheduled change to cancel" }, 404);
      return { success: true, canceled: true };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to cancel scheduled change" }, 500);
    }
  }

  @Post("subscriptions/branch-addon")
  @ApiOperation({ summary: "Purchase a branch addon subscription" })
  async branchAddon(@CurrentUser() user: AuthUser, @Body() body: BranchAddonDto, @Req() req: Request) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const result = await this.service.branchAddon(pharmacyId, body.planId, body.branchId, body.branch);
      const sub = result.subscription as { id: string };
      await this.audit.writeAuditLog({
        pharmacyId, userId: user.id, action: "INSERT", tableName: "subscriptions", recordId: sub?.id,
        newValues: { changeType: "branch_addon_requested", planId: body.planId, branchId: body.branchId ?? null },
        ipAddress: req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim(),
        userAgent: req.headers["user-agent"] ?? undefined,
      });
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Branch add-on failed" }, 500);
    }
  }
}
