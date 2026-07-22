import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Param,
  Post,
  Put,
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
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { ErrorResponseDto } from "../common/dto";
import { InventoryService } from "../inventory/inventory.service";
import {
  PHARMACY_PERMISSIONS,
  PharmacyPermissionService,
} from "../tenant/pharmacy-permission.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { BranchesService } from "./branches.service";
import {
  BranchInventoryItemDto,
  DeprecatedBranchesResponseDto,
  UpdateBranchDto,
  UpdateBranchResponseDto,
} from "./dto";

const BRANCH_ID_EXAMPLE = "8150740a-5ee8-4f92-8337-a72c7e390b9e";

const DEPRECATED_BRANCHES_RESPONSE = {
  error: "deprecated_endpoint",
  message: "Use /api/saas/branches for branch listing and creation.",
};

@ApiTags("Branches")
@Controller("branches")
export class BranchesController {
  constructor(
    private readonly service: BranchesService,
    private readonly inventory: InventoryService,
    private readonly tenant: TenantContextService,
    private readonly permissions: PharmacyPermissionService,
  ) {}

  @Get()
  @HttpCode(410)
  @ApiOperation({
    summary: "List branches (deprecated)",
    description: "This endpoint has been retired. Branch listing moved to /api/saas/branches.",
  })
  @ApiResponse({ status: 410, description: "The endpoint is permanently deprecated.", type: DeprecatedBranchesResponseDto })
  list() {
    return DEPRECATED_BRANCHES_RESPONSE;
  }

  @Post()
  @HttpCode(410)
  @ApiOperation({
    summary: "Create a branch (deprecated)",
    description: "This endpoint has been retired. Branch creation moved to /api/saas/branches.",
  })
  @ApiResponse({ status: 410, description: "The endpoint is permanently deprecated.", type: DeprecatedBranchesResponseDto })
  create() {
    return DEPRECATED_BRANCHES_RESPONSE;
  }

  @Put(":id")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({
    summary: "Update a branch",
    description: "Updates supplied branch profile fields for the authenticated pharmacy. Requires the `branches.manage` permission. Legacy aliases `location` (address) and `status` (activity) are accepted.",
  })
  @ApiParam({ name: "id", required: true, type: String, description: "Branch UUID within the authenticated pharmacy.", example: BRANCH_ID_EXAMPLE })
  @ApiBody({ required: true, description: "Branch fields to update; omitted fields remain unchanged.", type: UpdateBranchDto })
  @ApiOkResponse({ description: "The branch was updated.", type: UpdateBranchResponseDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user lacks the branch management permission.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The branch does not exist in the authenticated pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The branch could not be updated.", type: ErrorResponseDto })
  async update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const { ctx } = await this.permissions.requirePharmacyPermission(
        user.id,
        PHARMACY_PERMISSIONS.branchesManage,
      );
      const pharmacyId = ctx.activePharmacyId!;

      if (!(await this.service.exists(pharmacyId, id))) {
        throw new HttpException({ error: "Branch not found" }, 404);
      }

      const branch = await this.service.update(id, body);
      return { success: true, branch };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("PUT /api/branches/[id]", error);
      throw new HttpException({ error: "Failed to update branch" }, 500);
    }
  }

  @Get(":id")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({
    summary: "Get branch inventory",
    description: "Returns the active branch's inventory in lightweight form. Staff restricted to specific branches can only read branches they are assigned to.",
  })
  @ApiParam({ name: "id", required: true, type: String, description: "Branch UUID within the authenticated pharmacy.", example: BRANCH_ID_EXAMPLE })
  @ApiOkResponse({ description: "Branch inventory items were returned.", type: BranchInventoryItemDto, isArray: true })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user is not assigned to this branch.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The pharmacy or active branch was not found.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Branch inventory could not be loaded.", type: ErrorResponseDto })
  async inventoryForBranch(@CurrentUser() user: AuthUser, @Param("id") branchId: string) {
    try {
      const ctx = await this.tenant.resolveActiveContext(user.id);
      const pharmacyId = ctx.activePharmacyId;
      if (!pharmacyId) {
        throw new HttpException({ error: "Pharmacy not found" }, 404);
      }

      const allowedBranchIds = await this.tenant.getAllowedBranchIds(
        user.id,
        pharmacyId,
        ctx.role,
      );
      if (allowedBranchIds !== null && !allowedBranchIds.includes(branchId)) {
        throw new HttpException({ error: "Forbidden" }, 403);
      }

      if (!(await this.service.existsActive(pharmacyId, branchId))) {
        throw new HttpException({ error: "Branch not found" }, 404);
      }

      const inventory = await this.inventory.list(pharmacyId, branchId);
      return inventory.map((item) => ({
        id: item.id,
        name: item.name,
        stock: item.stock ?? 0,
        price: item.price ?? 0,
        category: item.category,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
      }));
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("GET /api/branches/[id]", error);
      throw new HttpException({ error: "Failed to fetch branch inventory" }, 500);
    }
  }
}
