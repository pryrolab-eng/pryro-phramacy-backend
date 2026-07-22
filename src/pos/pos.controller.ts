import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { ErrorResponseDto } from "../common/dto";
import { EntitlementError } from "../entitlements/entitlement.error";
import { TenantContextService } from "../tenant/tenant-context.service";
import {
  DailyCloseResponseDto,
  HoldSaleRequestDto,
  InvoiceRequestDto,
  PosDiscountRequestDto,
  PosProductDto,
  PosReturnRequestDto,
  PosSaleRequestDto,
  PosSuccessResponseDto,
  QuickAddCategoryRequestDto,
  QuickAddDrugRequestDto,
  QuickAddInsuranceRequestDto,
  QuickAddPatientRequestDto,
  ShiftActionRequestDto,
  VoidSaleRequestDto,
} from "./dto";
import { PosSaleService } from "./pos-sale.service";
import { PosService } from "./pos.service";

@ApiTags("POS")
@ApiCookieAuth("pryrox_session")
@ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
@ApiResponse({ status: 403, description: "The user lacks branch access, an open shift, or a required entitlement.", type: ErrorResponseDto })
@ApiResponse({ status: 500, description: "The POS operation failed unexpectedly.", type: ErrorResponseDto })
@Controller("pos")
export class PosController {
  constructor(
    private readonly service: PosService,
    private readonly saleService: PosSaleService,
    private readonly auth: AuthService,
    private readonly tenant: TenantContextService,
  ) {}

  private metadata(request: Request) {
    return {
      ipAddress: request.ip,
      userAgent: request.get("user-agent") ?? undefined,
    };
  }

  @Get()
  @ApiOperation({
    summary: "List the five most recent POS sales",
    description:
      "Returns an empty array when authentication or the underlying lookup fails, matching the legacy soft-auth route.",
  })
  @ApiQuery({ name: "branchId", required: false, type: String, description: "Optional branch UUID filter.", example: "8150740a-5ee8-4f92-8337-a72c7e390b9e" })
  @ApiOkResponse({ description: "Recent sales, or an empty array for soft failures.", type: PosSuccessResponseDto, isArray: true })
  async recent(
    @Req() request: Request,
    @Query("branchId") branchId?: string,
  ) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) return [];
      return this.service.recentSales(
        await this.tenant.requirePharmacyId(user.id),
        branchId?.trim() || undefined,
      );
    } catch (error) {
      console.error("GET /api/pos", error);
      return [];
    }
  }

  @Get("products")
  @ApiOperation({ summary: "List sellable POS inventory", description: "Returns in-stock, non-expired batches for an allowed branch in FEFO order. Unauthenticated requests return an empty array." })
  @ApiQuery({ name: "branchId", required: false, type: String, description: "Requested branch UUID; defaults to the active or sole assigned branch.", example: "8150740a-5ee8-4f92-8337-a72c7e390b9e" })
  @ApiOkResponse({ description: "Sellable inventory batches.", type: PosProductDto, isArray: true })
  @ApiResponse({ status: 400, description: "No active branch is available.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The branch or pharmacy is unavailable to the user.", type: ErrorResponseDto })
  async products(
    @Req() request: Request,
    @Query("branchId") branchId?: string,
  ) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) return [];
      const scope = await this.tenant.resolveRequestBranchScope(
        user.id,
        branchId?.trim() || undefined,
      );
      const selectedBranch =
        scope.branchId ?? (await this.tenant.requireBranchId(user.id));
      return this.service.listProducts(scope.pharmacyId, selectedBranch);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error fetching products";
      if (
        message.includes("No active branch") ||
        message.includes("assign you")
      ) {
        throw new HttpException(
          { error: message, code: "NO_ACTIVE_BRANCH" },
          400,
        );
      }
      if (message.includes("do not have access")) {
        throw new HttpException(
          { error: message, code: "BRANCH_FORBIDDEN" },
          403,
        );
      }
      if (message.includes("Pharmacy not found")) {
        throw new HttpException({ error: message, code: "NO_PHARMACY" }, 403);
      }
      console.error("GET /api/pos/products", error);
      return [];
    }
  }

  @Get("price-check")
  @ApiOperation({ summary: "Search inventory prices", description: "Searches medication names, barcodes, and batch numbers. Unauthenticated or non-entitlement internal failures return an empty array." })
  @ApiQuery({ name: "q", required: false, type: String, description: "Search text.", example: "amoxicillin" })
  @ApiQuery({ name: "branchId", required: false, type: String, description: "Optional branch UUID.", example: "8150740a-5ee8-4f92-8337-a72c7e390b9e" })
  @ApiOkResponse({ description: "Price matches.", type: PosSuccessResponseDto, isArray: true })
  async priceCheck(
    @Req() request: Request,
    @Query("q") query = "",
    @Query("branchId") branchId?: string,
  ) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) return [];
      const scope = await this.service.requireFeature(
        user.id,
        "pos.access",
        branchId?.trim() || undefined,
      );
      let selectedBranch = scope.branchId;
      if (!selectedBranch && !branchId) {
        try {
          selectedBranch = await this.tenant.requireBranchId(user.id);
        } catch {
          selectedBranch = null;
        }
      }
      return this.service.priceCheck(
        scope.pharmacyId,
        selectedBranch,
        query.trim(),
      );
    } catch (error) {
      if (error instanceof EntitlementError) throw error;
      console.error("GET /api/pos/price-check", error);
      return [];
    }
  }

  @Get("customer-lookup")
  @ApiOperation({ summary: "Lookup POS customers by phone", description: "Returns matching registered customers and historical walk-ins, including spend totals." })
  @ApiQuery({ name: "phone", required: false, type: String, description: "Full or partial phone number.", example: "+250788" })
  @ApiOkResponse({ description: "Phone matches; missing input and soft failures return an empty array.", type: PosSuccessResponseDto, isArray: true })
  async customerLookup(
    @Req() request: Request,
    @Query("phone") phone = "",
  ) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user || !phone.trim()) return [];
      const { pharmacyId } = await this.service.requireFeature(
        user.id,
        "pos.access",
      );
      return this.service.customerLookup(pharmacyId, phone);
    } catch (error) {
      if (error instanceof EntitlementError) throw error;
      console.error("GET /api/pos/customer-lookup", error);
      return [];
    }
  }

  @Get("sales/lookup")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Lookup a completed sale for return", description: "Finds a completed sale by receipt number or sale UUID and computes remaining returnable quantities." })
  @ApiQuery({ name: "receipt", required: false, type: String, description: "Receipt number.", example: "RCP-1784641234567" })
  @ApiQuery({ name: "saleId", required: false, type: String, description: "Sale UUID.", example: "108ce7bd-0351-44bb-89df-7c953b5193f5" })
  @ApiQuery({ name: "branchId", required: false, type: String, description: "Optional branch UUID constraint.", example: "8150740a-5ee8-4f92-8337-a72c7e390b9e" })
  @ApiOkResponse({ description: "Sale and returnable line details.", type: PosSuccessResponseDto })
  @ApiResponse({ status: 400, description: "Neither receipt nor sale ID was supplied.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "No matching completed sale exists.", type: ErrorResponseDto })
  async lookupSale(
    @CurrentUser() user: AuthUser,
    @Query("receipt") receipt?: string,
    @Query("saleId") saleId?: string,
    @Query("branchId") branchId?: string,
  ) {
    if (!receipt?.trim() && !saleId?.trim()) {
      throw new HttpException(
        { error: "receipt or saleId is required" },
        400,
      );
    }
    const { pharmacyId } = await this.service.requireFeature(
      user.id,
      "pos.returns",
      branchId?.trim() || undefined,
    );
    const lookup = await this.service.lookupSale({
      pharmacyId,
      receipt: receipt?.trim(),
      saleId: saleId?.trim(),
      branchId: branchId?.trim(),
    });
    if (!lookup) {
      throw new HttpException({ error: "Sale not found" }, 404);
    }
    return lookup;
  }

  @Get("discounts")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "List active POS discounts", description: "Returns active discounts configured for the authenticated pharmacy." })
  @ApiOkResponse({ description: "Active discounts.", type: PosSuccessResponseDto, isArray: true })
  async discounts(@CurrentUser() user: AuthUser) {
    try {
      return await this.service.listDiscounts(
        await this.tenant.requirePharmacyId(user.id),
      );
    } catch (error) {
      console.error("GET /api/pos/discounts", error);
      throw new HttpException({ error: "Failed to fetch discounts" }, 500);
    }
  }

  @Post("discounts")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Create a POS discount", description: "Creates an active fixed or percentage discount." })
  @ApiBody({ type: PosDiscountRequestDto })
  @ApiOkResponse({ description: "Discount created.", type: PosSuccessResponseDto })
  async createDiscount(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const discount = await this.service.createDiscount(
        await this.tenant.requirePharmacyId(user.id),
        body,
      );
      return { success: true, discount };
    } catch (error) {
      console.error("POST /api/pos/discounts", error);
      throw new HttpException({ error: "Failed to create discount" }, 500);
    }
  }

  @Get("hold-sale")
  @ApiOperation({ summary: "List held sales", description: "Lists up to twenty held carts for the current cashier. Unauthenticated or soft failures return an empty array." })
  @ApiQuery({ name: "branchId", required: false, type: String, description: "Optional branch UUID.", example: "8150740a-5ee8-4f92-8337-a72c7e390b9e" })
  @ApiOkResponse({ description: "Held carts.", type: PosSuccessResponseDto, isArray: true })
  async heldSales(
    @Req() request: Request,
    @Query("branchId") branchId?: string,
  ) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) return [];
      const scope = await this.service.requireFeature(
        user.id,
        "pos.access",
        branchId?.trim() || undefined,
      );
      return this.service.listHeldSales({
        pharmacyId: scope.pharmacyId,
        branchId: scope.branchId ?? undefined,
        cashierId: user.id,
      });
    } catch (error) {
      if (error instanceof EntitlementError) throw error;
      console.error("GET /api/pos/hold-sale", error);
      return [];
    }
  }

  @Post("hold-sale")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Hold a POS sale", description: "Persists the current customer and cart for the authenticated cashier." })
  @ApiBody({ type: HoldSaleRequestDto })
  @ApiOkResponse({ description: "Sale held.", type: PosSuccessResponseDto })
  async holdSale(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const branchId =
        typeof body.branchId === "string"
          ? body.branchId
          : await this.tenant.requireBranchId(user.id);
      const { pharmacyId } = await this.service.requireFeature(
        user.id,
        "pos.hold",
        branchId,
      );
      const cart = Array.isArray(body.cart) ? body.cart : [];
      const heldSale = await this.service.createHeldSale({
        pharmacyId,
        branchId,
        cashierId: user.id,
        customer: body.customer ?? null,
        cart,
      });
      return {
        success: true,
        heldSale: {
          id: heldSale.id,
          cart,
          customer: body.customer,
          timestamp: heldSale.created_at,
        },
      };
    } catch (error) {
      if (error instanceof EntitlementError) throw error;
      console.error("POST /api/pos/hold-sale", error);
      throw new HttpException({ error: "Failed to hold sale" }, 500);
    }
  }

  @Get("shifts")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Get current or team cashier shifts", description: "Returns the current cashier's open shift, or all open branch shifts for pharmacy owners when `team=open`." })
  @ApiQuery({ name: "branchId", required: true, type: String, description: "Branch UUID.", example: "8150740a-5ee8-4f92-8337-a72c7e390b9e" })
  @ApiQuery({ name: "team", required: false, enum: ["open"], description: "Set to `open` for the owner team view.", example: "open" })
  @ApiOkResponse({ description: "Current shift or team shift data.", type: PosSuccessResponseDto })
  async shifts(
    @CurrentUser() user: AuthUser,
    @Query("branchId") branchId?: string,
    @Query("team") team?: string,
  ) {
    if (!branchId?.trim()) {
      throw new HttpException({ error: "branchId is required" }, 400);
    }
    try {
      const { pharmacyId } = await this.service.requireFeature(
        user.id,
        "pos.access",
        branchId,
      );
      return team === "open"
        ? this.service.getTeamShifts({
            pharmacyId,
            branchId,
            currentUserId: user.id,
          })
        : this.service.getShift({
            pharmacyId,
            branchId,
            cashierId: user.id,
          });
    } catch (error) {
      if (error instanceof HttpException || error instanceof EntitlementError) {
        throw error;
      }
      throw new HttpException({ error: "Failed to load shift" }, 500);
    }
  }

  @Post("shifts")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Open or close a cashier shift", description: "Opens a branch till or closes an existing shift and computes cash variance." })
  @ApiBody({ type: ShiftActionRequestDto })
  @ApiOkResponse({ description: "Shift action completed.", type: PosSuccessResponseDto })
  async shiftAction(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    const branchId =
      typeof body.branchId === "string" ? body.branchId : undefined;
    if (!branchId) {
      throw new HttpException({ error: "branchId is required" }, 400);
    }
    try {
      const { pharmacyId } = await this.service.requireFeature(
        user.id,
        "pos.access",
        branchId,
      );
      if (body.action === "open") {
        return {
          success: true,
          shift: await this.service.openShift({
            pharmacyId,
            branchId,
            cashierId: user.id,
            openingCash: Number(body.openingCash) || 0,
          }),
        };
      }
      if (body.action === "close") {
        const shiftId =
          typeof body.shiftId === "string" ? body.shiftId : undefined;
        const actualCash = Number(body.actualCash);
        if (!shiftId || Number.isNaN(actualCash)) {
          throw new HttpException(
            { error: "shiftId and actualCash are required to close" },
            400,
          );
        }
        return {
          success: true,
          ...(await this.service.closeShift({
            shiftId,
            pharmacyId,
            branchId,
            cashierId: user.id,
            actualCash,
            closeNotes:
              typeof body.closeNotes === "string" ? body.closeNotes : null,
          })),
        };
      }
      throw new HttpException({ error: "Invalid action" }, 400);
    } catch (error) {
      if (error instanceof HttpException || error instanceof EntitlementError) {
        throw error;
      }
      throw new HttpException(
        {
          error:
            error instanceof Error ? error.message : "Shift action failed",
        },
        500,
      );
    }
  }

  @Post("quick-add-category")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Quick-add a medication category", description: "Creates a pharmacy-scoped category while accepting legacy field aliases." })
  @ApiBody({ type: QuickAddCategoryRequestDto })
  @ApiOkResponse({ description: "Category created.", type: PosSuccessResponseDto })
  async quickAddCategory(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    const name = String(body.categoryName || body.name || "").trim();
    if (!name) {
      throw new HttpException(
        { success: false, error: "Category name is required" },
        400,
      );
    }
    try {
      const category = await this.service.createCategory(
        await this.tenant.requirePharmacyId(user.id),
        body,
      );
      return { success: true, category };
    } catch (error) {
      console.error("Quick add category error:", error);
      throw new HttpException(
        { success: false, error: "Failed to add category" },
        500,
      );
    }
  }

  @Post("quick-add-patient")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Quick-add a POS patient", description: "Creates a customer from the compact POS patient form." })
  @ApiBody({ type: QuickAddPatientRequestDto })
  @ApiOkResponse({ description: "Patient created.", type: PosSuccessResponseDto })
  async quickAddPatient(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const customer = await this.service.createPatient(
        await this.tenant.requirePharmacyId(user.id),
        body,
      );
      return {
        success: true,
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          insurance_number: customer.insurance_number,
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: "Failed to add patient",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  }

  @Post("quick-add-drug")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Quick-add a POS drug batch", description: "Creates a medication and its first inventory batch in the user's active branch." })
  @ApiBody({ type: QuickAddDrugRequestDto })
  @ApiOkResponse({ description: "Medication and inventory batch created.", type: PosSuccessResponseDto })
  async quickAddDrug(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    const name = String(body.productName || body.name || "").trim();
    const category = String(body.category || "").trim();
    if (!name) {
      throw new HttpException(
        { success: false, error: "Product name is required" },
        400,
      );
    }
    if (!category) {
      throw new HttpException(
        { success: false, error: "Category is required" },
        400,
      );
    }
    try {
      const result = await this.service.quickAddDrug({
        pharmacyId: await this.tenant.requirePharmacyId(user.id),
        branchId: await this.tenant.requireBranchId(user.id),
        body,
      });
      return { success: true, ...result };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: "Failed to add product",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  }

  @Post("quick-add-insurance")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Quick-add an insurance provider", description: "Creates a pharmacy-scoped insurance provider with a default coverage percentage." })
  @ApiBody({ type: QuickAddInsuranceRequestDto })
  @ApiOkResponse({ description: "Provider created, or a legacy `success: false` envelope on failure.", type: PosSuccessResponseDto })
  async quickAddInsurance(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const insurance = await this.service.createInsurance(
        await this.tenant.requirePharmacyId(user.id),
        body,
      );
      return {
        success: true,
        insurance: {
          id: insurance.id,
          name: insurance.name,
          coverage_percentage: Number(
            insurance.coverage_percentage ??
              insurance.default_coverage_percent ??
              0,
          ),
        },
      };
    } catch (error) {
      console.error("Quick add insurance error:", error);
      return { success: false, error: "Failed to add insurance" };
    }
  }

  @Post("sale")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Complete a POS sale", description: "Validates expiry, prescription, insurance, branch stock, and shift state; then atomically writes the sale, decrements stock, records movements, and updates shift totals." })
  @ApiBody({ type: PosSaleRequestDto })
  @ApiOkResponse({ description: "Sale completed.", type: PosSuccessResponseDto })
  async sale(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ) {
    try {
      return await this.saleService.processSale(
        user.id,
        body,
        this.metadata(request),
      );
    } catch (error) {
      if (error instanceof HttpException || error instanceof EntitlementError) {
        throw error;
      }
      console.error("Sale processing error:", error);
      throw new HttpException(
        {
          success: false,
          error: "Failed to process sale",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  }

  @Post("returns")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Process a POS return", description: "Validates returnable quantities and dispositions, records refund lines, conditionally restocks inventory, and updates shift refunds atomically." })
  @ApiBody({ type: PosReturnRequestDto })
  @ApiOkResponse({ description: "Return processed.", type: PosSuccessResponseDto })
  async returns(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      return await this.saleService.processReturn(user.id, body);
    } catch (error) {
      if (error instanceof HttpException || error instanceof EntitlementError) {
        throw error;
      }
      throw new HttpException(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to process return",
        },
        500,
      );
    }
  }

  @Post("void-sale")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Void a completed POS sale", description: "Cancels a completed sale without returns, restores its inventory, records stock movements, and adjusts shift totals." })
  @ApiBody({ type: VoidSaleRequestDto })
  @ApiOkResponse({ description: "Sale voided.", type: PosSuccessResponseDto })
  async voidSale(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ) {
    return this.saleService.voidSale(user.id, body, this.metadata(request));
  }

  @Post("invoice")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Generate a POS insurance invoice", description: "Builds the legacy insurance invoice payload from pharmacy, provider, beneficiary, and medication pricing data." })
  @ApiBody({ type: InvoiceRequestDto })
  @ApiOkResponse({ description: "Invoice generated.", type: PosSuccessResponseDto })
  async invoice(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      return {
        success: true,
        invoice: await this.service.buildInvoice(
          await this.tenant.requirePharmacyId(user.id),
          body,
        ),
      };
    } catch (error) {
      console.error("POST /api/pos/invoice", error);
      throw new HttpException(
        { success: false, error: "Failed to generate invoice" },
        500,
      );
    }
  }

  @Post("daily-close")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Close the current POS day", description: "Aggregates today's completed sales by payment method and upserts the active branch's daily close record." })
  @ApiBody({ schema: { type: "object", additionalProperties: false }, description: "No request fields are required." })
  @ApiOkResponse({ description: "Daily close totals persisted.", type: DailyCloseResponseDto })
  async dailyClose(@CurrentUser() user: AuthUser) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const branchId = await this.tenant.requireBranchId(user.id);
      await this.service.requireFeature(user.id, "pos.access", branchId);
      return {
        success: true,
        dailyClose: await this.service.dailyClose({
          pharmacyId,
          branchId,
          userId: user.id,
        }),
      };
    } catch (error) {
      console.error("Daily close error:", error);
      throw new HttpException({ error: "Failed to close day" }, 500);
    }
  }
}
