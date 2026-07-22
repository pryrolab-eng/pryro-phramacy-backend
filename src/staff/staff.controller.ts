import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { ErrorResponseDto } from "../common/dto";
import { EntitlementError } from "../entitlements/entitlement.error";
import { EntitlementsService } from "../entitlements/entitlements.service";
import {
  PHARMACY_PERMISSIONS,
  PharmacyPermissionService,
} from "../tenant/pharmacy-permission.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import {
  ImportStaffDto,
  ImportStaffResponseDto,
  ResendInviteResponseDto,
  StaffBranchAccessDto,
  StaffCreationRejectedResponseDto,
  StaffMemberDto,
  DeleteStaffResponseDto,
  UpdateStaffBranchesDto,
  UpdateStaffBranchesResponseDto,
  UpdateStaffDto,
  UpdateStaffResponseDto,
} from "./dto";
import {
  buildStaffInviteApiPayload,
  generateTemporaryPassword,
  MAX_IMPORT_ROWS,
  MUST_CHANGE_PASSWORD_METADATA_KEY,
  STAFF_INVITE_EMAIL_REJECTED_MESSAGE,
  StaffInviteEmailRejectedError,
} from "./models";
import { StaffInviteService } from "./staff-invite.service";
import { StaffService } from "./staff.service";

const PHARMACY_USER_ID_EXAMPLE = "5f1c9f7e-42a9-4a91-b7d0-6cf62f5f9a44";

function auditMetadata(request: Request) {
  return {
    ipAddress: request.ip,
    userAgent: request.get("user-agent"),
  };
}

@ApiTags("Staff")
@Controller("staff")
export class StaffController {
  constructor(
    private readonly service: StaffService,
    private readonly invites: StaffInviteService,
    private readonly auth: AuthService,
    private readonly tenant: TenantContextService,
    private readonly permissions: PharmacyPermissionService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({
    summary: "List pharmacy staff",
    description: "Returns all staff memberships with linked user accounts for the authenticated pharmacy, newest first. Requires the `staff.manage` permission.",
  })
  @ApiOkResponse({ description: "Staff members were returned.", type: StaffMemberDto, isArray: true })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user lacks the staff management permission.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Staff could not be loaded.", type: ErrorResponseDto })
  async list(@CurrentUser() user: AuthUser) {
    try {
      await this.permissions.requirePharmacyPermission(
        user.id,
        PHARMACY_PERMISSIONS.staffManage,
      );
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      return await this.service.listPharmacyStaff(pharmacyId);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("GET /api/staff", error);
      throw new HttpException({ error: "Failed to fetch staff" }, 500);
    }
  }

  @Post()
  @HttpCode(400)
  @ApiOperation({
    summary: "Create staff (unsupported)",
    description: "Staff creation moved to /api/pharmacist; this route always rejects the request.",
  })
  @ApiResponse({ status: 400, description: "Staff creation is not supported on this route.", type: StaffCreationRejectedResponseDto })
  create() {
    return { success: false, error: "Use /api/pharmacist to create staff" };
  }

  @Post("import")
  @HttpCode(200)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({
    summary: "Import staff in bulk",
    description: `Invites up to ${MAX_IMPORT_ROWS} staff members from normalized rows, creating accounts with temporary passwords and sending invitation emails. Per-row failures are reported with the first data row counted as spreadsheet row 2. Requires the \`staff.manage\` permission and the \`staff.invite\` entitlement within the plan's user limit.`,
  })
  @ApiBody({ required: true, description: `Import payload containing 1–${MAX_IMPORT_ROWS} staff rows.`, type: ImportStaffDto })
  @ApiResponse({ status: 200, description: "Import processing completed. Validation failures and missing authentication are represented by `success: false` in the same 200 response.", type: ImportStaffResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user lacks the staff management permission, or the plan does not allow staff invites.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "An unexpected import error occurred; the handler normally reports it in the 200 response body.", type: ErrorResponseDto })
  async importRows(
    @Req() request: Request,
    @Body()
    body: {
      pharmacy_name?: string;
      rows?: Array<{ fullName?: string; email?: string; phone?: string; role?: string }>;
    },
  ) {
    try {
      const sessionUser = await this.auth.resolveUserFromRequest(request);
      if (!sessionUser) {
        return { success: false, error: "Unauthorized" };
      }

      await this.permissions.requirePharmacyPermission(
        sessionUser.id,
        PHARMACY_PERMISSIONS.staffManage,
      );

      const pharmacyId = await this.tenant.requirePharmacyId(sessionUser.id);
      const rows = body.rows ?? [];

      if (rows.length === 0) {
        return { success: false, error: "No rows to import" };
      }

      if (rows.length > MAX_IMPORT_ROWS) {
        return {
          success: false,
          error: `Import limited to ${MAX_IMPORT_ROWS} rows per batch`,
        };
      }

      await this.entitlements.assertEntitlement({
        pharmacyId,
        feature: "staff.invite",
        limit: "users",
      });

      const failures: Array<{ rowNumber: number; label: string; error: string }> =
        [];
      let succeeded = 0;

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]!;
        const label =
          row.fullName?.trim() || row.email?.trim() || "Unnamed staff";
        try {
          await this.invites.invitePharmacyStaffMember({
            pharmacyId,
            pharmacyName: String(body.pharmacy_name ?? "").trim(),
            email: String(row.email ?? "").trim().toLowerCase(),
            fullName: String(row.fullName ?? "").trim(),
            phone: String(row.phone ?? "").trim(),
            role: String(row.role ?? "staff").trim(),
            invitedByUserId: sessionUser.id,
            auditMetadata: auditMetadata(request),
          });
          succeeded += 1;
        } catch (error) {
          if (error instanceof StaffInviteEmailRejectedError) {
            failures.push({
              rowNumber: index + 2,
              label,
              error: STAFF_INVITE_EMAIL_REJECTED_MESSAGE,
            });
            continue;
          }
          failures.push({
            rowNumber: index + 2,
            label,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      return {
        success: failures.length === 0,
        attempted: rows.length,
        succeeded,
        failures,
      };
    } catch (error) {
      if (error instanceof HttpException || error instanceof EntitlementError) {
        throw error;
      }
      console.error("POST /api/staff/import", error);
      return {
        success: false,
        error: "Failed to import staff",
        details: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  @Put(":id")
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({
    summary: "Update a staff member",
    description: "Updates the linked profile name, pharmacy role, and activity status, optionally resets the account password (forcing a change at next sign-in), and writes an audit event. Requires the `staff.manage` permission.",
  })
  @ApiParam({ name: "id", required: true, type: String, description: "Pharmacy membership UUID (pharmacy_users row) of the staff member.", example: PHARMACY_USER_ID_EXAMPLE })
  @ApiBody({ required: true, description: "Staff fields to update; omitted fields remain unchanged.", type: UpdateStaffDto })
  @ApiOkResponse({ description: "The update completed. Password and update failures are represented by `success: false` in the same 200 response.", type: UpdateStaffResponseDto })
  @ApiResponse({ status: 400, description: "The staff account is not linked to a user.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user lacks the staff management permission.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The staff member does not exist in the authenticated pharmacy.", type: ErrorResponseDto })
  async update(
    @Req() request: Request,
    @Param("id") pharmacyUserId: string,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) {
        throw new HttpException({ success: false, error: "Unauthorized" }, 401);
      }

      await this.permissions.requirePharmacyPermission(
        user.id,
        PHARMACY_PERMISSIONS.staffManage,
      );
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);

      const member = await this.service.findPharmacyUser(pharmacyUserId);
      if (!member || member.pharmacy_id !== pharmacyId) {
        throw new HttpException(
          { success: false, error: "Staff member not found" },
          404,
        );
      }

      const authUserId = member.user_id;
      if (!authUserId) {
        throw new HttpException(
          { success: false, error: "Staff account is not linked to a user" },
          400,
        );
      }

      await this.service.updateStaffMember({
        pharmacyUserId,
        authUserId,
        name: body.name as string | undefined,
        phone: body.phone as string | undefined,
        role: body.role as string | undefined,
        isActive:
          body.status !== undefined ? body.status !== "inactive" : undefined,
      });

      if (body.password && String(body.password).trim()) {
        try {
          await this.service.updateAuthUserPassword(
            authUserId,
            body.password as string,
          );
          await this.service.updateAuthUserMetadata(authUserId, {
            [MUST_CHANGE_PASSWORD_METADATA_KEY]: true,
          });
        } catch (passwordError) {
          console.error("Password update error:", passwordError);
          return { success: false, error: "Failed to update password" };
        }
      }

      await this.audit.writeAuditLog({
        pharmacyId,
        userId: user.id,
        action: "UPDATE",
        tableName: "pharmacy_users",
        recordId: pharmacyUserId,
        oldValues: {
          role: member.role,
          is_active: member.is_active,
          user_id: member.user_id,
        },
        newValues: {
          name: body.name,
          phone: body.phone,
          role: body.role,
          isActive:
            body.status !== undefined ? body.status !== "inactive" : undefined,
          passwordChanged: Boolean(body.password && String(body.password).trim()),
        },
        ...auditMetadata(request),
      });

      return { success: true };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("Error updating staff:", error);
      return { success: false, error: "Failed to update staff member" };
    }
  }

  @Delete(":id")
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({
    summary: "Delete a staff member",
    description: "Removes the pharmacy membership, best-effort deletes the linked profile and auth account, and writes an audit event. Requires the `staff.manage` permission.",
  })
  @ApiParam({ name: "id", required: true, type: String, description: "Pharmacy membership UUID (pharmacy_users row) of the staff member.", example: PHARMACY_USER_ID_EXAMPLE })
  @ApiOkResponse({ description: "The delete completed. Failures are represented by `success: false` in the same 200 response.", type: DeleteStaffResponseDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user lacks the staff management permission.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The staff member does not exist in the authenticated pharmacy.", type: ErrorResponseDto })
  async remove(@Req() request: Request, @Param("id") pharmacyUserId: string) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) {
        throw new HttpException({ success: false, error: "Unauthorized" }, 401);
      }

      await this.permissions.requirePharmacyPermission(
        user.id,
        PHARMACY_PERMISSIONS.staffManage,
      );
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);

      const member = await this.service.findPharmacyUser(pharmacyUserId);
      if (!member || member.pharmacy_id !== pharmacyId) {
        throw new HttpException(
          { success: false, error: "Staff member not found" },
          404,
        );
      }

      await this.service.deletePharmacyUser(pharmacyUserId);

      if (member.user_id) {
        await this.service.deleteLinkedUserRecords(member.user_id);
      }

      await this.audit.writeAuditLog({
        pharmacyId,
        userId: user.id,
        action: "DELETE",
        tableName: "pharmacy_users",
        recordId: pharmacyUserId,
        oldValues: {
          role: member.role,
          is_active: member.is_active,
          user_id: member.user_id,
        },
        ...auditMetadata(request),
      });

      return { success: true };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("Error deleting staff:", error);
      return { success: false, error: "Failed to delete staff member" };
    }
  }

  @Get(":id/branches")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({
    summary: "Get a staff member's branch access",
    description: "Returns the branch UUIDs a staff member is restricted to. An empty list means access is unrestricted.",
  })
  @ApiParam({ name: "id", required: true, type: String, description: "Pharmacy membership UUID (pharmacy_users row) of the staff member.", example: PHARMACY_USER_ID_EXAMPLE })
  @ApiOkResponse({ description: "Branch access was returned.", type: StaffBranchAccessDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The staff member does not exist in the authenticated pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Branch access could not be loaded.", type: ErrorResponseDto })
  async branchAccess(
    @CurrentUser() user: AuthUser,
    @Param("id") pharmacyUserId: string,
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const member = await this.service.findPharmacyUser(pharmacyUserId);

      if (!member || member.pharmacy_id !== pharmacyId) {
        throw new HttpException({ error: "Staff member not found" }, 404);
      }

      const branchIds = await this.service.getStaffBranchIds(pharmacyUserId);

      return {
        pharmacyUserId,
        branchIds,
        unrestricted: branchIds.length === 0,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("GET staff branches", error);
      throw new HttpException({ error: "Failed to load branch access" }, 500);
    }
  }

  @Put(":id/branches")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({
    summary: "Update a staff member's branch access",
    description: "Replaces the staff member's branch assignments and writes an audit event. An empty `branchIds` array removes all restrictions. Requires the `staff.manage` permission.",
  })
  @ApiParam({ name: "id", required: true, type: String, description: "Pharmacy membership UUID (pharmacy_users row) of the staff member.", example: PHARMACY_USER_ID_EXAMPLE })
  @ApiBody({ required: true, description: "Branch assignments to save.", type: UpdateStaffBranchesDto })
  @ApiOkResponse({ description: "Branch assignments were saved.", type: UpdateStaffBranchesResponseDto })
  @ApiResponse({ status: 400, description: "A supplied branch UUID does not belong to the authenticated pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user lacks the staff management permission.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The staff member does not exist in the authenticated pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Branch access could not be updated.", type: ErrorResponseDto })
  async updateBranchAccess(
    @CurrentUser() user: AuthUser,
    @Param("id") pharmacyUserId: string,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ) {
    try {
      await this.permissions.requirePharmacyPermission(
        user.id,
        PHARMACY_PERMISSIONS.staffManage,
      );
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const member = await this.service.findPharmacyUser(pharmacyUserId);

      if (!member || member.pharmacy_id !== pharmacyId) {
        throw new HttpException({ error: "Staff member not found" }, 404);
      }

      const branchIds = Array.isArray(body.branchIds)
        ? (body.branchIds as string[]).filter((id) => typeof id === "string")
        : [];

      if (branchIds.length > 0) {
        const validCount = await this.service.countPharmacyBranchesByIds({
          pharmacyId,
          branchIds,
        });
        if (validCount !== branchIds.length) {
          throw new HttpException({ error: "Invalid branch id" }, 400);
        }
      }

      const previousBranchIds = await this.service.getStaffBranchIds(pharmacyUserId);
      await this.service.setStaffBranchAssignments({ pharmacyUserId, branchIds });
      await this.audit.writeAuditLog({
        pharmacyId,
        userId: user.id,
        action: "UPDATE",
        tableName: "staff_branch_assignments",
        recordId: pharmacyUserId,
        oldValues: { branchIds: previousBranchIds },
        newValues: { branchIds, unrestricted: branchIds.length === 0 },
        ...auditMetadata(request),
      });

      return {
        success: true,
        branchIds,
        unrestricted: branchIds.length === 0,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("PUT staff branches", error);
      throw new HttpException({ error: "Failed to update branch access" }, 500);
    }
  }

  @Post(":id/resend-invite")
  @HttpCode(200)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({
    summary: "Resend a staff member's login instructions",
    description: "Resets the staff member's password to a new temporary one, forces a change at next sign-in, and re-sends the invitation email. Requires the `staff.manage` permission and the `staff.invite` entitlement.",
  })
  @ApiParam({ name: "id", required: true, type: String, description: "Pharmacy membership UUID (pharmacy_users row) of the staff member.", example: PHARMACY_USER_ID_EXAMPLE })
  @ApiResponse({ status: 200, description: "The password was reset. When email delivery fails, manual credentials are included in the response.", type: ResendInviteResponseDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user lacks the staff management permission, or the plan does not include staff invites.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The staff member does not exist in the authenticated pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The staff account could not be loaded or the password reset failed.", type: ErrorResponseDto })
  async resendInvite(@Req() request: Request, @Param("id") pharmacyUserId: string) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) {
        throw new HttpException({ success: false, error: "Unauthorized" }, 401);
      }

      await this.permissions.requirePharmacyPermission(
        user.id,
        PHARMACY_PERMISSIONS.staffManage,
      );
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);

      await this.entitlements.assertEntitlement({
        pharmacyId,
        feature: "staff.invite",
      });

      const member = await this.service.findPharmacyUser(pharmacyUserId);
      if (!member || member.pharmacy_id !== pharmacyId || !member.user_id) {
        throw new HttpException(
          { success: false, error: "Staff member not found" },
          404,
        );
      }

      const memberUserId = member.user_id;
      const authAccount = await this.service.getAuthUserById(memberUserId);
      if (!authAccount?.email) {
        throw new HttpException(
          { success: false, error: "Could not load staff account" },
          500,
        );
      }

      const email = authAccount.email.trim().toLowerCase();
      const fullName =
        String(authAccount.user_metadata?.full_name ?? "").trim() ||
        email.split("@")[0]?.replace(/[._]/g, " ") ||
        "Team member";
      const role = String(member.role ?? "pharmacist").trim() || "pharmacist";

      const pharmacyName =
        String((await this.service.getPharmacyName(pharmacyId)) ?? "").trim() ||
        "your pharmacy";
      const password = generateTemporaryPassword();

      try {
        await this.service.updateAuthUserPassword(memberUserId, password);
        await this.service.updateAuthUserMetadata(memberUserId, {
          [MUST_CHANGE_PASSWORD_METADATA_KEY]: true,
        });
      } catch {
        throw new HttpException(
          { success: false, error: "Failed to reset password" },
          500,
        );
      }

      const emailResult = await this.invites.sendStaffInviteEmail({
        to: email,
        fullName,
        pharmacyName,
        role,
        temporaryPassword: password,
      });

      return buildStaffInviteApiPayload({
        email,
        temporaryPassword: password,
        emailResult,
        userId: memberUserId,
        messageWhenEmailOk: "Login instructions were sent by email",
        messageWhenEmailFailed:
          "Password was reset; invitation email could not be sent",
      });
    } catch (error) {
      if (error instanceof HttpException || error instanceof EntitlementError) {
        throw error;
      }
      console.error("Resend staff invite error:", error);
      throw new HttpException(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to resend login instructions",
        },
        500,
      );
    }
  }
}
