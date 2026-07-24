import { Body, Controller, Delete, Get, HttpException, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { ErrorResponseDto } from "../common/dto";
import { TenantContextService } from "../tenant/tenant-context.service";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { CancelSaaSSubscriptionDto, CreateBranchDto, SaasCreatePlanDto as CreatePlanDto, GenerateInvoiceDto, SubscribeDto, UpdatePlanDto } from "./dto";
import { SaaSService } from "./saas.service";

@ApiTags("SaaS")
@Controller()
export class SaaSController {
  constructor(
    private readonly service: SaaSService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  // --- Plans ---

  @Get("saas/plans")
  @ApiOperation({ summary: "List active subscription plans" })
  async listPlans() {
    try {
      return { plans: await this.service.getActivePlans() };
    } catch (error) {
      throw new HttpException({ error: "Failed to load plans" }, 500);
    }
  }

  @Post("saas/plans")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Create a subscription plan (admin)" })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  async createPlan(@CurrentUser() user: AuthUser, @Body() body: CreatePlanDto) {
    try {
      if (!(await this.isPlatformAdmin(user.id))) throw new HttpException({ error: "Forbidden" }, 403);
      const plan = await this.service.createPlan(body);
      return { plan: { ...plan, feature_keys: body.featureKeys ?? [] } };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to create plan" }, 500);
    }
  }

  @Put("saas/plans/:planId")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Update a subscription plan (admin)" })
  async updatePlan(@CurrentUser() user: AuthUser, @Param("planId") planId: string, @Body() body: UpdatePlanDto) {
    try {
      if (!(await this.isPlatformAdmin(user.id))) throw new HttpException({ error: "Forbidden" }, 403);
      const plan = await this.service.updatePlan(planId, body as unknown as Record<string, unknown>);
      return { plan };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to update plan" }, 500);
    }
  }

  @Delete("saas/plans/:planId")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Deactivate a subscription plan (admin)" })
  async deactivatePlan(@CurrentUser() user: AuthUser, @Param("planId") planId: string) {
    try {
      if (!(await this.isPlatformAdmin(user.id))) throw new HttpException({ error: "Forbidden" }, 403);
      await this.service.deactivatePlan(planId);
      return { success: true };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to deactivate plan" }, 500);
    }
  }

  // --- Subscribe ---

  @Post("saas/subscribe")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Subscribe pharmacy owner to a plan" })
  async subscribe(@CurrentUser() user: AuthUser, @Body() body: SubscribeDto) {
    try {
      const membership = await this.findActiveMembership(user.id, ["pharmacy_owner", "admin"]);
      if (!membership?.pharmacy_id) throw new HttpException({ error: "Pharmacy not found or insufficient role" }, 403);
      if (!body.plan_id) throw new HttpException({ error: "plan_id is required" }, 400);
      const plan = await this.service.getPlanById(body.plan_id);
      if (!plan) throw new HttpException({ error: "Plan not found" }, 404);
      if (body.subscription_type === "branch_addon" && !body.branch_id) {
        throw new HttpException({ error: "branch_id is required for branch_addon subscriptions" }, 400);
      }
      const subscription = await this.service.activateSubscription({
        pharmacy_id: membership.pharmacy_id,
        plan_id: body.plan_id,
        subscription_type: body.subscription_type ?? "main",
        branch_id: body.branch_id,
      });
      const requiresPayment = subscription.status === "pending_payment";
      return { subscription, requiresPayment, message: requiresPayment ? "Complete checkout to activate this plan." : undefined };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Subscription failed" }, 500);
    }
  }

  // --- Subscription summary ---

  @Get("saas/subscription")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Get subscription summary for pharmacy" })
  async getSubscription(@CurrentUser() user: AuthUser) {
    try {
      const membership = await this.findActiveMembership(user.id);
      if (!membership?.pharmacy_id) throw new HttpException({ error: "Pharmacy not found" }, 404);
      return { summary: await this.service.getPharmacySubscriptionSummary(membership.pharmacy_id) };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to load subscription" }, 500);
    }
  }

  @Post("saas/subscription/cancel")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Cancel a subscription" })
  async cancelSubscription(@CurrentUser() user: AuthUser, @Body() body: CancelSaaSSubscriptionDto) {
    try {
      const membership = await this.findActiveMembership(user.id, ["pharmacy_owner", "admin"]);
      if (!membership?.pharmacy_id) throw new HttpException({ error: "Forbidden" }, 403);
      await this.service.cancelSubscription(body.subscription_id, membership.pharmacy_id);
      return { success: true };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to cancel subscription" }, 500);
    }
  }

  // --- Branches ---

  @Get("saas/branches")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "List branches with usage" })
  async listBranches(@CurrentUser() user: AuthUser) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      return await this.service.listBranchesWithUsage(pharmacyId);
    } catch (error) {
      throw new HttpException({ error: "Failed to load branches" }, 500);
    }
  }

  @Post("saas/branches")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Create a new branch (checks limit)" })
  async createBranch(@CurrentUser() user: AuthUser, @Body() body: CreateBranchDto, @Req() req: Request) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      if (!body.name?.trim()) throw new HttpException({ error: "Branch name is required" }, 400);
      const branch = await this.service.createBranch(pharmacyId, body);
      await this.audit.writeAuditLog({
        pharmacyId, userId: user.id, action: "INSERT", tableName: "branches",
        newValues: branch, ipAddress: req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim(),
        userAgent: req.headers["user-agent"] ?? undefined, recordId: (branch as { id: string }).id,
      });
      return { branch };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to create branch" }, 500);
    }
  }

  // --- Invoices ---

  @Get("saas/invoice")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Get monthly invoices" })
  async listInvoices(@CurrentUser() user: AuthUser, @Query("month") month?: string) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      return { invoices: await this.service.saasListSubscriptionInvoices(pharmacyId, month) };
    } catch (error) {
      throw new HttpException({ error: "Failed to load invoices" }, 500);
    }
  }

  @Post("saas/invoice")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Generate a monthly invoice" })
  async generateInvoice(@CurrentUser() user: AuthUser, @Body() body: any) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const now = new Date();
      const month = body?.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const invoice = await this.service.generateMonthlyInvoice(pharmacyId, month);
      return { invoice };
    } catch (error) {
      console.error("generateInvoice error:", error);
      throw new HttpException({ error: "Failed to generate invoice" }, 500);
    }
  }

  // --- Usage ---

  @Get("saas/usage/check")
  @ApiOperation({ summary: "Check if a branch can transact" })
  async checkUsage(@Query("branch_id") branchId: string) {
    if (!branchId) throw new HttpException({ error: "branch_id is required" }, 400);
    try {
      return await this.service.checkBranchCanTransact(branchId);
    } catch (error) {
      throw new HttpException({ error: "Usage check failed" }, 500);
    }
  }

  @Post("saas/usage/increment")
  @ApiOperation({ summary: "Increment transaction count for a branch" })
  async incrementUsage(@Body() body: { branch_id: string }) {
    if (!body.branch_id) throw new HttpException({ error: "branch_id is required" }, 400);
    try {
      return await this.service.incrementBranchTx(body.branch_id);
    } catch (error) {
      throw new HttpException({ error: "Failed to increment usage" }, 500);
    }
  }

  // --- Admin ---

  @Get("saas/admin/subscriptions")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "View all subscriptions (admin)" })
  async adminListSubscriptions(@CurrentUser() user: AuthUser, @Query("status") status?: string, @Query("limit") limit?: string, @Query("offset") offset?: string) {
    try {
      if (!(await this.isPlatformAdmin(user.id))) throw new HttpException({ error: "Forbidden" }, 403);
      return { subscriptions: await this.service.getAllSubscriptions({ status, limit: Number(limit ?? 50), offset: Number(offset ?? 0) }) };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to load subscriptions" }, 500);
    }
  }

  @Post("saas/admin/reset-usage")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Trigger monthly usage reset (admin)" })
  async adminResetUsage(@CurrentUser() user: AuthUser) {
    try {
      if (!(await this.isPlatformAdmin(user.id))) throw new HttpException({ error: "Forbidden" }, 403);
      return { reset_count: await this.service.rpcResetMonthlyBranchUsage() };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Reset failed" }, 500);
    }
  }

  // --- Helpers ---

  private isPlatformAdmin(userId: string): Promise<boolean> {
    return this.prisma.public_users
      .findUnique({ where: { id: userId }, select: { is_platform_admin: true } })
      .then((row) => row?.is_platform_admin === true);
  }

  private async findActiveMembership(userId: string, roles?: string[]) {
    const where: Record<string, unknown> = { user_id: userId, is_active: true };
    if (roles?.length) where.role = { in: roles };
    return this.prisma.pharmacy_users.findFirst({
      where: where as never,
      select: { pharmacy_id: true },
    });
  }
}
