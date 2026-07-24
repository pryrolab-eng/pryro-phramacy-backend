import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import {
  ApiBody,
  ApiCookieAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from "@nestjs/swagger";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { ErrorResponseDto } from "../common/dto";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import {
  combinedCustomer,
  CustomersService,
  formattedCustomer,
  parseAllergies,
} from "./customers.service";
import {
  AdjustLoyaltyDto,
  AdjustLoyaltyResponseDto,
  CombinedCustomersResponseDto,
  CreateCustomerDto,
  CreateCustomerResponseDto,
  CustomerDetailResponseDto,
  CustomerDto,
  CustomerHistoryResponseDto,
  CustomerSearchResultDto,
  DeleteCustomerResponseDto,
  ImportCustomersDto,
  ImportCustomersResponseDto,
  LoyaltyRecordDto,
  UpdateCustomerDto,
  UpdateCustomerResponseDto,
} from "./dto";
import { MAX_IMPORT_ROWS } from "./models";

const customerIdExample = "3b5a6248-3e85-4b44-9f7f-9cd0a0da21c5";

@ApiTags("Customers")
@ApiExtraModels(CustomerDto, CustomerSearchResultDto)
@Controller("customers")
export class CustomersController {
  constructor(
    private readonly service: CustomersService,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly tenant: TenantContextService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List or search customers",
    description: "Returns customers for the authenticated user's pharmacy, including purchase totals and pagination support. When `q` is supplied, returns at most five lightweight matches. An unauthenticated request or an internal lookup failure returns an empty result.",
  })
  @ApiQuery({ name: "q", required: false, type: String, description: "Optional case-insensitive search across name, phone variants, email, and insurance number.", example: "Uwase" })
  @ApiQuery({ name: "page", required: false, type: Number, description: "1-indexed page number.", example: 1 })
  @ApiQuery({ name: "limit", required: false, type: Number, description: "Page size limit (1-200).", example: 50 })
  @ApiOkResponse({
    description: "Customers were returned. Unfiltered results are paginated.",
  })
  async list(
    @Req() request: Request,
    @Query("q") rawQuery?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) return { rows: [], total: 0, page: 1, limit: 50 };
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const query = rawQuery?.trim() || "";
      if (query) {
        const rows = await this.service.search(pharmacyId, query);
        return rows.map((row) => ({ ...row, phone: row.phone ?? "" }));
      }
      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Math.min(200, Number(limit) || 50));
      const [result, totals] = await Promise.all([
        this.service.list(pharmacyId, pageNum, limitNum),
        this.service.totals(pharmacyId),
      ]);
      const formattedRows = result.rows.map((row) =>
        formattedCustomer(row, this.service.lookupTotal(totals, row.name, row.phone)),
      );
      return {
        rows: formattedRows,
        total: result.total,
        page: result.page,
        limit: result.limit,
      };
    } catch (error) {
      console.error("GET /api/customers", error);
      throw new HttpException({ error: "Failed to fetch customers" }, 500);
    }
  }

  @Post()
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({
    summary: "Create a customer",
    description: "Creates a customer in the authenticated user's pharmacy. Legacy aliases `patientName`, `phoneNumber`, and `insuranceNumber` are accepted.",
  })
  @ApiBody({ required: true, description: "Customer details to create.", type: CreateCustomerDto })
  @ApiResponse({ status: 201, description: "Creation was attempted. Business failures are represented by `success: false` in the same response status.", type: CreateCustomerResponseDto })
  @ApiResponse({ status: 400, description: "The request body is invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user cannot create customers.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "An unexpected server error prevented request processing.", type: ErrorResponseDto })
  async create(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    try {
      const customer = await this.service.create({
        pharmacyId: await this.tenant.requirePharmacyId(user.id),
        name: String(body.name || body.patientName || ""),
        phone: String(body.phone || body.phoneNumber || ""),
        email: String(body.email || ""),
        dateOfBirth: body.dateOfBirth ? String(body.dateOfBirth) : null,
        allergies: parseAllergies(body.allergies),
        insuranceNumber: String(body.insurance || body.insuranceNumber || ""),
      });
      return {
        success: true,
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          insurance_number: customer.insurance_number,
        },
        message: "Customer added to database successfully",
      };
    } catch (error) {
      console.error("POST /api/customers", error);
      return { success: false, error: "Failed to add customer" };
    }
  }

  @Get("combined")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Get the combined customer dashboard", description: "Returns customer records, aggregate customer statistics, and the ten most recent customers for the authenticated pharmacy." })
  @ApiQuery({ name: "branchId", required: false, type: String, description: "Legacy branch filter accepted for client compatibility; currently does not change the pharmacy-wide result.", example: "8150740a-5ee8-4f92-8337-a72c7e390b9e" })
  @ApiOkResponse({ description: "Combined customer dashboard data. Internal failures return the same shape with empty arrays and zero statistics.", type: CombinedCustomersResponseDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user cannot view customer data.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "An unexpected server error occurred; the handler degrades to an empty dashboard response.", type: ErrorResponseDto })
  async combined(@CurrentUser() user: AuthUser, @Query("branchId") _branchId?: string) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const { rows: customers } = await this.service.list(pharmacyId, 1, 10000);
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const stats = {
        total: customers.length,
        active: customers.filter((row) => row.is_active !== false).length,
        withInsurance: customers.filter(
          (row) => (row.insurance_number ?? "").trim().length > 0,
        ).length,
        newThisMonth: customers.filter((row) => {
          if (!row.created_at) return false;
          const date = new Date(row.created_at);
          return !Number.isNaN(date.getTime()) && date >= monthStart;
        }).length,
      };
      return {
        customers: customers.map(combinedCustomer),
        stats,
        recent: customers.slice(0, 10).map(combinedCustomer),
      };
    } catch (error) {
      console.error("GET /api/customers/combined", error);
      return {
        customers: [],
        stats: { total: 0, active: 0, newThisMonth: 0, withInsurance: 0 },
        recent: [],
      };
    }
  }

  @Get("history")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Get a customer's sales history", description: "Resolves a customer by `customerId`, or directly by phone/name, then returns recent sales. At least one lookup query is required." })
  @ApiQuery({ name: "customerId", required: false, type: String, description: "Customer UUID. When supplied, its stored name and phone take precedence over direct lookup values.", example: customerIdExample })
  @ApiQuery({ name: "phone", required: false, type: String, description: "Customer phone number used when `customerId` is omitted.", example: "+250788123456" })
  @ApiQuery({ name: "name", required: false, type: String, description: "Customer name used when `customerId` and phone are omitted.", example: "Aline Uwase" })
  @ApiQuery({ name: "limit", required: false, type: Number, description: "Maximum sales to return; values are clamped to 1–100 and default to 20.", example: 20 })
  @ApiOkResponse({ description: "Customer sales history in both current and legacy response keys.", type: CustomerHistoryResponseDto })
  @ApiResponse({ status: 400, description: "No customer lookup value was supplied.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user cannot view customer history.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The supplied customer ID does not exist in the pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Customer history could not be loaded.", type: ErrorResponseDto })
  async history(
    @CurrentUser() user: AuthUser,
    @Query("customerId") customerId = "",
    @Query("phone") phone = "",
    @Query("name") name = "",
    @Query("limit") rawLimit?: string,
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      let lookupName = name.trim();
      let lookupPhone: string | null = phone.trim() || null;
      if (customerId.trim()) {
        const customer = await this.service.find(pharmacyId, customerId.trim());
        if (!customer) throw new HttpException({ error: "Customer not found" }, 404);
        lookupName = customer.name;
        lookupPhone = customer.phone;
      }
      if (!lookupName && !lookupPhone) {
        throw new HttpException({ error: "Provide customerId, phone, or name" }, 400);
      }
      const parsed = Number(rawLimit);
      const limit = Number.isFinite(parsed)
        ? Math.min(Math.max(Math.trunc(parsed), 1), 100)
        : 20;
      const history = await this.service.recentSales(
        pharmacyId,
        lookupName || "Walk-in Customer",
        lookupPhone,
        limit,
      );
      return { history, recentSales: history };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("GET /api/customers/history", error);
      throw new HttpException({ error: "Failed to load customer history" }, 500);
    }
  }

  @Post("import")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Import customers in bulk", description: `Creates up to ${MAX_IMPORT_ROWS} customers from normalized row objects and reports per-row failures. The first data row is reported as spreadsheet row 2.` })
  @ApiBody({ required: true, description: `Import payload containing 1–${MAX_IMPORT_ROWS} customer rows.`, type: ImportCustomersDto })
  @ApiResponse({ status: 201, description: "Import processing completed. Validation and row failures are represented in the response body.", type: ImportCustomersResponseDto })
  @ApiResponse({ status: 400, description: "The import payload is malformed.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user cannot import customers.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "An unexpected import error occurred; the handler normally reports it in the 201 response body.", type: ErrorResponseDto })
  async importRows(
    @CurrentUser() user: AuthUser,
    @Body() body: { rows?: Array<Record<string, unknown>> },
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const rows = body.rows ?? [];
      if (!rows.length) return { success: false, error: "No rows to import" };
      if (rows.length > MAX_IMPORT_ROWS) {
        return { success: false, error: `Import limited to ${MAX_IMPORT_ROWS} rows per batch` };
      }
      const failures: Array<{ rowNumber: number; label: string; error: string }> = [];
      let succeeded = 0;
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]!;
        const normalized = {
          name: String(row.name ?? "").trim(),
          phone: String(row.phone ?? "").trim(),
          email: String(row.email ?? "").trim() || undefined,
          dateOfBirth: String(row.dateOfBirth ?? "").trim() || undefined,
          allergies: String(row.allergies ?? "").trim() || undefined,
          insurance: String(row.insurance ?? "").trim() || undefined,
        };
        try {
          await this.service.create({
            pharmacyId,
            name: normalized.name,
            phone: normalized.phone,
            email: normalized.email,
            dateOfBirth: normalized.dateOfBirth || null,
            allergies: normalized.allergies
              ? normalized.allergies.split(/[,;]/).map((value) => value.trim()).filter(Boolean)
              : [],
            insuranceNumber: normalized.insurance,
          });
          succeeded += 1;
        } catch (error) {
          failures.push({
            rowNumber: index + 2,
            label: normalized.name || "Unnamed customer",
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
      return {
        success: false,
        error: "Failed to import customers",
        details: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  @Get("loyalty")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "List customer loyalty balances", description: "Returns all loyalty records for the authenticated pharmacy, ordered by points descending." })
  @ApiOkResponse({ description: "Loyalty balances were returned.", type: LoyaltyRecordDto, isArray: true })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user cannot view loyalty data.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Loyalty data could not be fetched.", type: ErrorResponseDto })
  async loyalty(@CurrentUser() user: AuthUser) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const rows = await this.prisma.customer_loyalty.findMany({
        where: { pharmacy_id: pharmacyId },
        include: { customers: { select: { name: true } } },
        orderBy: { points: "desc" },
      });
      return rows.map((row) => ({
        id: row.id,
        customerId: row.customer_id,
        name: row.customers?.name || "Unknown",
        points: row.points,
        tier: row.tier,
        totalSpent: row.total_spent,
      }));
    } catch {
      throw new HttpException({ error: "Failed to fetch loyalty data" }, 500);
    }
  }

  @Post("loyalty")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Adjust customer loyalty points", description: "Adds points when `action` is `add`; any other action subtracts points. The tier is recalculated using Bronze, Silver, and Gold thresholds." })
  @ApiBody({ required: true, description: "Loyalty adjustment.", type: AdjustLoyaltyDto })
  @ApiResponse({ status: 201, description: "Loyalty points and tier were updated.", type: AdjustLoyaltyResponseDto })
  @ApiResponse({ status: 400, description: "The adjustment body is invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user cannot update loyalty data.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "No loyalty record exists for the customer.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Loyalty points could not be updated.", type: ErrorResponseDto })
  async updateLoyalty(
    @CurrentUser() user: AuthUser,
    @Body() body: { customerId?: string; points?: number; action?: string },
  ) {
    try {
      await this.tenant.requirePharmacyId(user.id);
      const loyalty = await this.prisma.customer_loyalty.findFirst({
        where: { customer_id: body.customerId },
      });
      if (!loyalty) throw new HttpException({ error: "Loyalty record not found" }, 404);
      const newPoints =
        Number(loyalty.points ?? 0) +
        (body.action === "add" ? Number(body.points) : -Number(body.points));
      const customer = await this.prisma.customer_loyalty.update({
        where: { id: loyalty.id },
        data: {
          points: newPoints,
          tier: newPoints >= 500 ? "Gold" : newPoints >= 200 ? "Silver" : "Bronze",
        },
      });
      return { success: true, customer };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to update loyalty points" }, 500);
    }
  }

  @Get(":id")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Get customer details", description: "Returns a pharmacy customer with purchase totals and their twenty most recent sales." })
  @ApiParam({ name: "id", required: true, type: String, description: "Customer UUID within the authenticated pharmacy.", example: customerIdExample })
  @ApiOkResponse({ description: "Customer details and recent sales were returned.", type: CustomerDetailResponseDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user cannot view this customer.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The customer does not exist in the authenticated pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Customer details could not be loaded.", type: ErrorResponseDto })
  async detail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const customer = await this.service.find(pharmacyId, id);
      if (!customer) throw new HttpException({ error: "Not found" }, 404);
      const [totals, recentSales] = await Promise.all([
        this.service.totals(pharmacyId),
        this.service.recentSales(pharmacyId, customer.name, customer.phone),
      ]);
      return {
        customer: formattedCustomer(
          customer,
          this.service.lookupTotal(totals, customer.name, customer.phone),
        ),
        recentSales,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("GET /api/customers/[id]", error);
      throw new HttpException({ error: "Failed to load customer" }, 500);
    }
  }

  @Patch(":id")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Update a customer", description: "Partially updates accepted customer profile fields and returns the formatted customer with recalculated purchase totals." })
  @ApiParam({ name: "id", required: true, type: String, description: "Customer UUID within the authenticated pharmacy.", example: customerIdExample })
  @ApiBody({ required: true, description: "Customer fields to update; omitted fields remain unchanged.", type: UpdateCustomerDto })
  @ApiOkResponse({ description: "The customer was updated.", type: UpdateCustomerResponseDto })
  @ApiResponse({ status: 400, description: "The update body is invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user cannot update this customer.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The customer does not exist in the authenticated pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The customer could not be updated.", type: ErrorResponseDto })
  async update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const existing = await this.service.find(pharmacyId, id);
      if (!existing) {
        throw new HttpException({ success: false, error: "Not found" }, 404);
      }
      const updates: Parameters<CustomersService["update"]>[2] = {};
      if (body.name !== undefined) updates.name = String(body.name).trim();
      if (body.phone !== undefined) updates.phone = String(body.phone).trim();
      if (body.email !== undefined) updates.email = body.email ? String(body.email) : null;
      if (body.dateOfBirth !== undefined) {
        updates.dateOfBirth = body.dateOfBirth ? String(body.dateOfBirth) : null;
      }
      if (body.allergies !== undefined) updates.allergies = parseAllergies(body.allergies);
      if (body.insurance !== undefined) {
        updates.insuranceNumber = body.insurance ? String(body.insurance) : null;
      }
      if (body.status !== undefined) updates.isActive = body.status !== "inactive";
      const updated = await this.service.update(pharmacyId, id, updates);
      if (!updated) {
        throw new HttpException({ success: false, error: "Update failed" }, 500);
      }
      const totals = await this.service.totals(pharmacyId);
      return {
        success: true,
        customer: formattedCustomer(
          updated,
          this.service.lookupTotal(totals, updated.name, updated.phone),
        ),
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("PATCH /api/customers/[id]", error);
      throw new HttpException({ success: false, error: "Failed to update customer" }, 500);
    }
  }

  @Delete(":id")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Delete a customer", description: "Deletes the customer when the identifier belongs to the authenticated pharmacy. The operation is idempotent and returns success even when no row matched." })
  @ApiParam({ name: "id", required: true, type: String, description: "Customer UUID within the authenticated pharmacy.", example: customerIdExample })
  @ApiOkResponse({ description: "The delete operation completed.", type: DeleteCustomerResponseDto })
  @ApiResponse({ status: 400, description: "The customer identifier is malformed.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user cannot delete customers.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The customer was not found. The current idempotent handler normally returns 200 instead.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The customer could not be deleted.", type: ErrorResponseDto })
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    try {
      await this.prisma.customers.deleteMany({
        where: { id, pharmacy_id: await this.tenant.requirePharmacyId(user.id) },
      });
      return { success: true };
    } catch (error) {
      console.error("DELETE /api/customers/[id]", error);
      throw new HttpException({ success: false, error: "Failed to delete customer" }, 500);
    }
  }
}
