import { Body, Controller, Get, HttpException, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { AuthUser } from "../auth/auth.types";
import { ErrorResponseDto } from "../common/dto";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { PrismaService } from "../prisma/prisma.service";
import { ActivePharmacyContext, TenantContextService } from "../tenant/tenant-context.service";
import {
  ContextSwitchResponseDto,
  MeContextResponseDto,
  SetActiveBranchDto,
  SetActivePharmacyDto,
  StaffDashboardResponseDto,
  SuccessResponseDto,
  UpdateProfileDto,
  WorkplaceResponseDto,
} from "./dto";
import { MeService } from "./me.service";

@ApiTags("Current User")
@ApiCookieAuth("pryrox_session")
@Controller("me")
@UseGuards(SessionGuard)
export class MeController {
  constructor(
    private readonly service: MeService,
    private readonly tenant: TenantContextService,
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  private fail(error: unknown, message: string): never {
    if (error instanceof HttpException) throw error;
    console.error(message, error);
    throw new HttpException({ error: message }, 500);
  }

  @Patch("profile")
  @ApiOperation({ summary: "Update the current user's profile", description: "Updates one or both supported display-name fields for the authenticated public user profile." })
  @ApiBody({ required: true, description: "Profile fields to update.", type: UpdateProfileDto })
  @ApiResponse({ status: 200, description: "The profile was updated.", type: SuccessResponseDto })
  @ApiResponse({ status: 401, description: "A valid session cookie was not supplied.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The profile could not be updated.", type: ErrorResponseDto })
  async profile(
    @CurrentUser() user: AuthUser,
    @Body() body: { name?: string; full_name?: string },
  ) {
    try {
      await this.prisma.public_users.update({
        where: { id: user.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.full_name !== undefined ? { full_name: body.full_name } : {}),
          updated_at: new Date(),
        },
      });
      return { success: true };
    } catch (error) {
      return this.fail(error, "Failed to update profile");
    }
  }

  @Get("context")
  @ApiOperation({ summary: "Get the current session context", description: "Returns the authenticated user's identity, active pharmacy and branch, permissions, memberships, and password-change requirement." })
  @ApiResponse({ status: 200, description: "The session context was loaded.", type: MeContextResponseDto })
  @ApiResponse({ status: 401, description: "A valid session cookie was not supplied.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The session context could not be loaded.", type: ErrorResponseDto })
  async context(@CurrentUser() user: AuthUser) {
    try {
      return await this.service.context(user);
    } catch (error) {
      return this.fail(error, "Failed to load session context");
    }
  }

  @Post("active-pharmacy")
  @ApiOperation({ summary: "Switch the active pharmacy", description: "Selects a pharmacy the authenticated user can access and resolves the corresponding active branch and role." })
  @ApiBody({ required: true, description: "Pharmacy selection.", type: SetActivePharmacyDto })
  @ApiResponse({ status: 201, description: "The active pharmacy was switched.", type: ContextSwitchResponseDto })
  @ApiResponse({ status: 400, description: "pharmacyId was omitted.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "A valid session cookie was not supplied.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The user cannot access the requested pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The pharmacy switch failed.", type: ErrorResponseDto })
  async activePharmacy(
    @CurrentUser() user: AuthUser,
    @Body() body: { pharmacyId?: string },
  ) {
    if (!body.pharmacyId) {
      throw new HttpException({ error: "pharmacyId is required" }, 400);
    }
    try {
      return this.switchResponse(
        await this.tenant.setActivePharmacy(user.id, body.pharmacyId),
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const message = error instanceof Error ? error.message : "Failed to switch pharmacy";
      throw new HttpException({ error: message }, message.includes("access") ? 403 : 500);
    }
  }

  @Post("active-branch")
  @ApiOperation({ summary: "Switch the active branch", description: "Selects an entitled, accessible branch within the active pharmacy for the authenticated user." })
  @ApiBody({ required: true, description: "Branch selection.", type: SetActiveBranchDto })
  @ApiResponse({ status: 201, description: "The active branch was switched.", type: ContextSwitchResponseDto })
  @ApiResponse({ status: 400, description: "branchId was omitted.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "A valid session cookie was not supplied.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The branch is invalid or inaccessible.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The branch is outside the current plan, access is paused, or switching failed.", type: ErrorResponseDto })
  async activeBranch(
    @CurrentUser() user: AuthUser,
    @Body() body: { branchId?: string },
  ) {
    if (!body.branchId) {
      throw new HttpException({ error: "branchId is required" }, 400);
    }
    try {
      const context = await this.tenant.resolveActiveContext(user.id);
      if (context.activePharmacyId) {
        const entitlements = await this.entitlements.resolvePharmacyEntitlements(
          context.activePharmacyId,
        );
        if (!entitlements.isAccessAllowed) {
          throw new HttpException(
            { error: "Branch switching is disabled while pharmacy access is paused" },
            500,
          );
        }
        const allowed = await this.tenant.getAllowedBranchIds(
          user.id,
          context.activePharmacyId,
          context.role,
        );
        const entitledBranches = await this.prisma.branches.findMany({
          where: {
            pharmacy_id: context.activePharmacyId,
            is_active: { not: false },
            ...(allowed ? { id: { in: allowed } } : {}),
          },
          orderBy: { created_at: "asc" },
          take: entitlements.limits.totalBranchSlots,
          select: { id: true },
        });
        if (!entitledBranches.some((branch) => branch.id === body.branchId)) {
          throw new HttpException(
            { error: "This branch is not included in your current plan" },
            500,
          );
        }
      }
      return this.switchResponse(
        await this.tenant.setActiveBranch(user.id, body.branchId),
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const message = error instanceof Error ? error.message : "Failed to switch branch";
      const status = message.includes("Invalid") || message.includes("access") ? 403 : 500;
      throw new HttpException({ error: message }, status);
    }
  }

  @Get("workplace")
  @ApiOperation({ summary: "Get the current workplace", description: "Returns active pharmacy details, membership role, visible branches, and the active branch for the authenticated user." })
  @ApiResponse({ status: 200, description: "Workplace details were loaded.", type: WorkplaceResponseDto })
  @ApiResponse({ status: 401, description: "A valid session cookie was not supplied.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The user has no active pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Workplace details could not be loaded.", type: ErrorResponseDto })
  async workplace(@CurrentUser() user: AuthUser) {
    try {
      return await this.service.workplace(user.id);
    } catch (error) {
      return this.fail(error, "Failed to load workplace");
    }
  }

  @Get("staff-dashboard")
  @ApiOperation({ summary: "Get the staff dashboard summary", description: "Returns role-aware operational metrics for the active pharmacy based on the authenticated user's effective permissions." })
  @ApiResponse({ status: 200, description: "Dashboard metrics were loaded.", type: StaffDashboardResponseDto })
  @ApiResponse({ status: 401, description: "A valid session cookie was not supplied.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The user has no active pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Dashboard metrics could not be loaded.", type: ErrorResponseDto })
  async dashboard(@CurrentUser() user: AuthUser) {
    try {
      return await this.service.dashboard(user.id);
    } catch (error) {
      return this.fail(error, "Failed to load dashboard summary");
    }
  }

  private switchResponse(ctx: ActivePharmacyContext) {
    return {
      success: true,
      activePharmacyId: ctx.activePharmacyId,
      activeBranchId: ctx.activeBranchId,
      role: ctx.role,
    };
  }
}
