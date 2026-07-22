import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
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
import { TenantContextService } from "../tenant/tenant-context.service";
import {
  AddMedicationDto,
  AdjustInventoryDto,
  CombinedInventoryDto,
  CreateInventoryDto,
  CreateSupplierDto,
  CreateTransferDto,
  ExpiryAlertDto,
  ImportInventoryDto,
  ImportInventoryResponseDto,
  InventoryAnalyticsDto,
  InventoryCreatedResponseDto,
  InventoryListItemDto,
  MedicationAddedResponseDto,
  PurchaseInventoryDto,
  StockChangedResponseDto,
  SuccessResponseDto,
  SupplierCreatedResponseDto,
  SupplierDto,
  TransferCreatedResponseDto,
  TransferDto,
  UpdateInventoryDto,
} from "./dto";
import { InventoryService } from "./inventory.service";
import { INVENTORY_UUID_EXAMPLES } from "./models";

const MAX_IMPORT_ROWS = 500;
const UUID = INVENTORY_UUID_EXAMPLES;

const unauthorizedResponse = {
  status: 401,
  description: "The session cookie is missing, invalid, or expired.",
  type: ErrorResponseDto,
};

const forbiddenResponse = {
  status: 403,
  description: "The pharmacy plan or user scope does not permit inventory access.",
  type: ErrorResponseDto,
};

const internalErrorResponse = {
  status: 500,
  description: "An unexpected inventory or database operation failed.",
  type: ErrorResponseDto,
};

function auditMetadata(request: Request) {
  return {
    ipAddress: request.ip,
    userAgent: request.get("user-agent"),
  };
}

@ApiTags("Inventory")
@ApiCookieAuth("pryrox_session")
@Controller("inventory")
export class InventoryController {
  constructor(
    private readonly service: InventoryService,
    private readonly auth: AuthService,
    private readonly tenant: TenantContextService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
  ) {}

  private async entitled(userId: string) {
    const pharmacyId = await this.tenant.requirePharmacyId(userId);
    await this.entitlements.assertEntitlement({
      pharmacyId,
      feature: "inventory.access",
    });
    return pharmacyId;
  }

  @Get()
  @ApiOperation({
    summary: "List inventory",
    description:
      "Returns inventory visible to the current session, optionally limited to a branch. An unauthenticated or failed lookup returns an empty list.",
  })
  @ApiQuery({
    name: "branchId",
    required: false,
    type: String,
    description: "UUID of the branch to list; omit it to use the session's resolved branch scope.",
    example: UUID.branch,
  })
  @ApiOkResponse({
    description: "Inventory records were returned, ordered according to the inventory service.",
    type: InventoryListItemDto,
    isArray: true,
  })
  @ApiResponse(internalErrorResponse)
  async list(@Req() request: Request, @Query("branchId") branchId?: string) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) return [];
      const scope = await this.tenant.resolveRequestBranchScope(user.id, branchId);
      return await this.service.list(scope.pharmacyId, scope.branchId);
    } catch (error) {
      console.error("GET /api/inventory", error);
      return [];
    }
  }

  @Post()
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: "Create an inventory record",
    description:
      "Creates stock for an existing medication in the authenticated user's branch and records an audit event.",
  })
  @ApiBody({
    required: true,
    description: "Inventory values for an existing medication.",
    type: CreateInventoryDto,
  })
  @ApiResponse({
    status: 201,
    description: "The record was created and returned.",
    type: InventoryCreatedResponseDto,
  })
  @ApiResponse({ status: 400, description: "The submitted inventory data is invalid.", type: ErrorResponseDto })
  @ApiResponse(unauthorizedResponse)
  @ApiResponse(forbiddenResponse)
  @ApiResponse(internalErrorResponse)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ) {
    try {
      const pharmacyId = await this.entitled(user.id);
      const inventory = await this.service.createInventory({
        pharmacyId,
        branchId: await this.tenant.requireBranchId(user.id),
        medicationId: String(body.medication_id),
        batchNumber: body.batch_number as string | undefined,
        quantity: Number(body.quantity),
        unitCost: body.unit_cost == null ? undefined : Number(body.unit_cost),
        sellingPrice: body.selling_price == null ? undefined : Number(body.selling_price),
        minimumStockLevel:
          body.minimum_stock_level == null ? undefined : Number(body.minimum_stock_level),
        expiryDate: body.expiry_date as string | undefined,
        stockLocation: body.stockLocation ?? body.stock_location ?? body.stock_location_id,
      });
      await this.audit.writeAuditLog({
        pharmacyId,
        userId: user.id,
        action: "INSERT",
        tableName: "inventory",
        recordId: inventory.id,
        newValues: inventory,
        ...auditMetadata(request),
      });
      return { success: true, inventory };
    } catch (error) {
      if (error instanceof EntitlementError) throw error;
      console.error("POST /api/inventory", error);
      return { success: false, error: "Failed to create inventory" };
    }
  }

  @Put(":id")
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: "Update inventory levels and pricing",
    description:
      "Updates any supplied stock quantity, selling price, or minimum-stock threshold and writes an audit event.",
  })
  @ApiParam({
    name: "id",
    required: true,
    type: String,
    description: "UUID of the inventory record to update.",
    example: UUID.inventory,
  })
  @ApiBody({
    required: true,
    description: "Only supplied fields are changed; omitted fields remain unchanged.",
    type: UpdateInventoryDto,
  })
  @ApiOkResponse({ description: "The inventory record was updated and audited.", type: SuccessResponseDto })
  @ApiResponse({ status: 400, description: "The inventory ID or supplied values are invalid.", type: ErrorResponseDto })
  @ApiResponse(unauthorizedResponse)
  @ApiResponse(forbiddenResponse)
  @ApiResponse(internalErrorResponse)
  async update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ) {
    try {
      const pharmacyId = await this.entitled(user.id);
      await this.service.updateInventory(id, body);
      await this.audit.writeAuditLog({
        pharmacyId,
        userId: user.id,
        action: "UPDATE",
        tableName: "inventory",
        recordId: id,
        newValues: {
          quantity: body.quantity,
          selling_price: body.selling_price,
          minimum_stock_level: body.minimum_stock_level,
        },
        ...auditMetadata(request),
      });
      return { success: true };
    } catch (error) {
      if (error instanceof EntitlementError) throw error;
      console.error("PUT /api/inventory/[id]", error);
      throw new HttpException({ success: false, error: "Failed to update" }, 500);
    }
  }

  @Delete(":id")
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: "Delete an inventory record",
    description: "Permanently deletes the specified inventory record and writes a deletion audit event.",
  })
  @ApiParam({
    name: "id",
    required: true,
    type: String,
    description: "UUID of the inventory record to delete.",
    example: UUID.inventory,
  })
  @ApiOkResponse({ description: "The inventory record was deleted and audited.", type: SuccessResponseDto })
  @ApiResponse({ status: 400, description: "The inventory ID is malformed.", type: ErrorResponseDto })
  @ApiResponse(unauthorizedResponse)
  @ApiResponse(forbiddenResponse)
  @ApiResponse(internalErrorResponse)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Req() request: Request,
  ) {
    try {
      const pharmacyId = await this.entitled(user.id);
      await this.service.deleteInventory(id);
      await this.audit.writeAuditLog({
        pharmacyId,
        userId: user.id,
        action: "DELETE",
        tableName: "inventory",
        recordId: id,
        oldValues: { id },
        ...auditMetadata(request),
      });
      return { success: true };
    } catch (error) {
      if (error instanceof EntitlementError) throw error;
      console.error("DELETE /api/inventory/[id]", error);
      throw new HttpException({ success: false, error: "Failed to delete" }, 500);
    }
  }

  @Post("add")
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: "Add a medication to inventory",
    description:
      "Creates a pharmacy medication and inventory batch, or increments an existing medication's stock in the current branch.",
  })
  @ApiBody({
    required: true,
    description: "Medication identity, category, stock, pricing, expiry, and location values.",
    type: AddMedicationDto,
  })
  @ApiResponse({ status: 201, description: "Medication stock was created or incremented.", type: MedicationAddedResponseDto })
  @ApiResponse({ status: 400, description: "The medication or stock data is invalid.", type: ErrorResponseDto })
  @ApiResponse(unauthorizedResponse)
  @ApiResponse(forbiddenResponse)
  @ApiResponse(internalErrorResponse)
  async add(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    try {
      const pharmacyId = await this.entitled(user.id);
      return await this.service.addMedication(
        body,
        pharmacyId,
        await this.tenant.requireBranchId(user.id),
      );
    } catch (error) {
      if (error instanceof EntitlementError) throw error;
      console.error("POST /api/inventory/add", error);
      return {
        success: false,
        error: "Failed to add medication",
        details: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  @Post("adjustment")
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: "Adjust an inventory quantity",
    description:
      "Increases or decreases stock for one inventory record, floors decreases at zero, and records the adjustment in the audit log.",
  })
  @ApiBody({
    required: true,
    description: "Inventory record, adjustment direction, quantity, and optional reason.",
    type: AdjustInventoryDto,
  })
  @ApiResponse({ status: 201, description: "The resulting stock level was returned.", type: StockChangedResponseDto })
  @ApiResponse({ status: 400, description: "The stock adjustment is invalid.", type: ErrorResponseDto })
  @ApiResponse(unauthorizedResponse)
  @ApiResponse(forbiddenResponse)
  @ApiResponse({ status: 404, description: "No inventory record exists for productId.", type: ErrorResponseDto })
  @ApiResponse(internalErrorResponse)
  async adjustment(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ) {
    try {
      const pharmacyId = await this.entitled(user.id);
      const adjustmentType = body.adjustmentType === "increase" ? "increase" : "decrease";
      const newStock = await this.service.adjust(
        String(body.productId),
        adjustmentType,
        Number(body.quantity),
      );
      await this.audit.writeAuditLog({
        pharmacyId,
        userId: user.id,
        action: "UPDATE",
        tableName: "inventory",
        recordId: String(body.productId),
        newValues: {
          adjustmentType,
          quantity: body.quantity,
          newStock,
          ...(body.reason ? { reason: body.reason } : {}),
        },
        ...auditMetadata(request),
      });
      return { success: true, newStock };
    } catch (error) {
      if (error instanceof EntitlementError) throw error;
      const message = error instanceof Error ? error.message : "Adjustment failed";
      throw new HttpException(
        { success: false, error: message },
        message.includes("not found") ? 404 : 500,
      );
    }
  }

  @Get("analytics")
  @ApiOperation({
    summary: "Get inventory analytics",
    description:
      "Aggregates stock quantity and value by category and produces a month-to-date inventory value trend. Unauthenticated or failed lookups return empty datasets.",
  })
  @ApiOkResponse({ description: "Category stock totals and inventory trend were returned.", type: InventoryAnalyticsDto })
  @ApiResponse(internalErrorResponse)
  async analytics(@Req() request: Request) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) return { stockByCategory: [], inventoryTrend: [] };
      return await this.service.analytics(await this.tenant.requirePharmacyId(user.id));
    } catch (error) {
      console.error("GET /api/inventory/analytics", error);
      return { stockByCategory: [], inventoryTrend: [] };
    }
  }

  @Get("combined")
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: "Get the combined inventory dashboard",
    description:
      "Returns branch-scoped inventory, low-stock/expiry groups, and pharmacy-wide expiry alerts in one request.",
  })
  @ApiQuery({
    name: "branchId",
    required: false,
    type: String,
    description: "UUID of the branch to load; omit it to use the session's resolved branch scope.",
    example: UUID.branch,
  })
  @ApiOkResponse({ description: "Combined inventory and alert datasets were returned.", type: CombinedInventoryDto })
  @ApiResponse({ status: 400, description: "The branch scope is invalid.", type: ErrorResponseDto })
  @ApiResponse(unauthorizedResponse)
  @ApiResponse(forbiddenResponse)
  @ApiResponse(internalErrorResponse)
  async combined(@CurrentUser() user: AuthUser, @Query("branchId") branchId?: string) {
    try {
      const scope = await this.tenant.resolveRequestBranchScope(user.id, branchId);
      const [inventory, stockAlerts, expiryAlerts] = await Promise.all([
        this.service.list(scope.pharmacyId, scope.branchId),
        this.service.stockAlerts(scope.pharmacyId, scope.branchId),
        this.service.expiryAlerts(scope.pharmacyId, 60),
      ]);
      return { inventory, stockAlerts, expiryAlerts };
    } catch (error) {
      console.error("GET /api/inventory/combined", error);
      return {
        inventory: [],
        stockAlerts: { all: [], lowStock: [], expiring: [] },
        expiryAlerts: [],
      };
    }
  }

  @Get("expiry-alerts")
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: "List expiring inventory",
    description:
      "Returns pharmacy inventory expiring on or before the requested horizon, sorted by nearest expiry.",
  })
  @ApiQuery({
    name: "withinDays",
    required: false,
    type: Number,
    description: "Positive whole-number look-ahead window. Defaults to 60 days and is capped at 365 days.",
    example: 90,
  })
  @ApiOkResponse({ description: "Expiry alerts were returned in ascending order.", type: ExpiryAlertDto, isArray: true })
  @ApiResponse({ status: 400, description: "The expiry horizon is invalid.", type: ErrorResponseDto })
  @ApiResponse(unauthorizedResponse)
  @ApiResponse(internalErrorResponse)
  async expiry(@CurrentUser() user: AuthUser, @Query("withinDays") value?: string) {
    try {
      const parsed = Number(value ?? "60");
      const days = Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 365) : 60;
      return await this.service.expiryAlerts(
        await this.tenant.requirePharmacyId(user.id),
        days,
      );
    } catch (error) {
      console.error("GET /api/inventory/expiry-alerts", error);
      throw new HttpException({ error: "Failed to fetch expiry alerts" }, 500);
    }
  }

  @Post("import")
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: "Import inventory rows",
    description:
      "Imports up to 500 medication rows into the current branch, reporting per-row failures without rolling back successful rows.",
  })
  @ApiBody({ required: true, description: "A batch of normalized inventory rows.", type: ImportInventoryDto })
  @ApiResponse({ status: 201, description: "The import batch was processed.", type: ImportInventoryResponseDto })
  @ApiResponse({ status: 400, description: "The import batch is empty, too large, or invalid.", type: ErrorResponseDto })
  @ApiResponse(unauthorizedResponse)
  @ApiResponse(forbiddenResponse)
  @ApiResponse(internalErrorResponse)
  async importRows(
    @CurrentUser() user: AuthUser,
    @Body() body: { rows?: Array<Record<string, unknown>> },
  ) {
    try {
      const pharmacyId = await this.entitled(user.id);
      const branchId = await this.tenant.requireBranchId(user.id);
      const rows = body.rows ?? [];
      if (!rows.length) return { success: false, error: "No rows to import" };
      if (rows.length > MAX_IMPORT_ROWS) {
        return { success: false, error: `Import limited to ${MAX_IMPORT_ROWS} rows per batch` };
      }
      return await this.service.importRows(rows, pharmacyId, branchId);
    } catch (error) {
      if (error instanceof EntitlementError) throw error;
      return {
        success: false,
        error: "Failed to import inventory",
        details: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  @Post("purchase")
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: "Receive purchased stock",
    description: "Increases an inventory record's quantity and optionally replaces its acquisition cost.",
  })
  @ApiBody({
    required: true,
    description: "Purchased inventory record, received quantity, and optional unit cost.",
    type: PurchaseInventoryDto,
  })
  @ApiResponse({ status: 201, description: "Purchased units were added.", type: StockChangedResponseDto })
  @ApiResponse({ status: 400, description: "The purchase data is invalid.", type: ErrorResponseDto })
  @ApiResponse(unauthorizedResponse)
  @ApiResponse(forbiddenResponse)
  @ApiResponse({ status: 404, description: "No inventory record exists for productId.", type: ErrorResponseDto })
  @ApiResponse(internalErrorResponse)
  async purchase(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    try {
      await this.entitled(user.id);
      const newStock = await this.service.receivePurchase(
        String(body.productId),
        Number(body.quantity),
        body.costPrice == null ? undefined : Number(body.costPrice),
      );
      return { success: true, newStock };
    } catch (error) {
      if (error instanceof EntitlementError) throw error;
      const message = error instanceof Error ? error.message : "Purchase failed";
      throw new HttpException(
        { success: false, error: message },
        message.includes("not found") ? 404 : 500,
      );
    }
  }

  @Get("suppliers")
  @ApiOperation({
    summary: "List active suppliers",
    description: "Returns all active suppliers available to the Prisma connection, newest first.",
  })
  @ApiOkResponse({ description: "Active suppliers were returned.", type: SupplierDto, isArray: true })
  @ApiResponse(internalErrorResponse)
  async suppliers() {
    try {
      return await this.service.suppliers();
    } catch (error) {
      console.error("GET /api/inventory/suppliers", error);
      throw new HttpException({ error: "Failed to fetch suppliers" }, 500);
    }
  }

  @Post("suppliers")
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: "Create a supplier",
    description:
      "Creates an active supplier for the authenticated user's pharmacy using the submitted contact details.",
  })
  @ApiBody({ required: true, description: "Supplier business and contact details.", type: CreateSupplierDto })
  @ApiResponse({ status: 201, description: "The supplier was created.", type: SupplierCreatedResponseDto })
  @ApiResponse({ status: 400, description: "The supplier data is invalid.", type: ErrorResponseDto })
  @ApiResponse(unauthorizedResponse)
  @ApiResponse(forbiddenResponse)
  @ApiResponse(internalErrorResponse)
  async createSupplier(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const supplier = await this.service.createSupplier(await this.entitled(user.id), body);
      return { success: true, supplier };
    } catch (error) {
      if (error instanceof EntitlementError) throw error;
      throw new HttpException({ success: false, error: "Failed to create supplier" }, 500);
    }
  }

  @Get("transfers")
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: "List recent inventory transfers",
    description:
      "Returns up to 100 transfers for the authenticated user's pharmacy, newest first, in dashboard format.",
  })
  @ApiOkResponse({ description: "Recent pharmacy transfers were returned.", type: TransferDto, isArray: true })
  @ApiResponse(unauthorizedResponse)
  @ApiResponse(forbiddenResponse)
  @ApiResponse(internalErrorResponse)
  async transfers(@CurrentUser() user: AuthUser) {
    try {
      return await this.service.transfers(await this.tenant.requirePharmacyId(user.id));
    } catch (error) {
      console.error("GET /api/inventory/transfers", error);
      throw new HttpException({ error: "Failed to fetch transfers" }, 500);
    }
  }

  @Post("transfers")
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: "Transfer stock between branches",
    description:
      "Moves a positive quantity from one branch to another, creates destination stock when needed, records the transfer, and writes an audit event.",
  })
  @ApiBody({
    required: true,
    description: "Inventory record, source branch, destination branch, and quantity. Legacy aliases are accepted.",
    type: CreateTransferDto,
  })
  @ApiResponse({ status: 201, description: "Stock was moved between branches.", type: TransferCreatedResponseDto })
  @ApiResponse({ status: 400, description: "The transfer data is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse(unauthorizedResponse)
  @ApiResponse(forbiddenResponse)
  @ApiResponse({ status: 404, description: "The source inventory record was not found.", type: ErrorResponseDto })
  @ApiResponse(internalErrorResponse)
  async createTransfer(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ) {
    try {
      const pharmacyId = await this.entitled(user.id);
      const productId = body.productId ?? body.inventoryId;
      const fromBranchId = body.fromBranchId ?? body.from;
      const toBranchId = body.toBranchId ?? body.to;
      const quantity = parseInt(String(body.quantity), 10);
      if (!productId || !fromBranchId || !toBranchId || !Number.isFinite(quantity)) {
        throw new HttpException(
          {
            success: false,
            error: "productId, fromBranchId, toBranchId, and quantity are required",
          },
          400,
        );
      }
      const result = await this.service.transfer({
        pharmacyId,
        inventoryId: String(productId),
        fromBranchId: String(fromBranchId),
        toBranchId: String(toBranchId),
        quantity,
      });
      await this.audit.writeAuditLog({
        pharmacyId,
        userId: user.id,
        action: "INSERT",
        tableName: "inventory_transfers",
        recordId: result.transferId,
        newValues: {
          inventoryId: productId,
          fromBranchId,
          toBranchId,
          quantity,
          sourceStock: result.sourceStock,
          destinationStock: result.destinationStock,
        },
        ...auditMetadata(request),
      });
      return {
        success: true,
        newStock: result.sourceStock,
        destinationStock: result.destinationStock,
        transferId: result.transferId,
      };
    } catch (error) {
      if (error instanceof HttpException || error instanceof EntitlementError) throw error;
      throw new HttpException(
        {
          success: false,
          error: error instanceof Error ? error.message : "Failed to create transfer",
        },
        500,
      );
    }
  }
}
