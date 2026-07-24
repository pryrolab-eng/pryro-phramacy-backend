import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
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
import { ClickhouseService } from "../clickhouse/clickhouse.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  PHARMACY_PERMISSIONS,
  PharmacyPermissionService,
} from "../tenant/pharmacy-permission.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import {
  ApplyFormularyDto,
  ApplyFormularyResponseDto,
  CoveragePreviewDto,
  CoverageResponseDto,
  CoverageUpdateResponseDto,
  CreateInsuranceProviderDto,
  InsuranceLookupDto,
  InsurancePricingUpdateDto,
  InsuranceProviderDto,
  LookupResponseDto,
  PricingResponseDto,
  ProcessInsuranceDto,
  ProcessInsuranceResponseDto,
  ProviderMutationResponseDto,
  UpdateClaimStatusDto,
  UpdateClaimStatusResponseDto,
  UpdateInsuranceProviderDto,
} from "./dto";
import { InsuranceService } from "./insurance.service";
import type {
  CoverageLineInput,
  CoverageLineResult,
} from "./models/insurance.types";

const MAX_IMPORT_ROWS = 500;
const VALID_STATUSES = ["pending", "processing", "approved", "rejected"];
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["processing", "approved", "rejected"],
  processing: ["approved", "rejected"],
  approved: [],
  rejected: ["pending"],
};

function clampCoveragePercent(value: unknown): number | null {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return null;
  return Math.min(100, Math.max(0, parsed));
}

function coverageLines(value: unknown): CoverageLineInput[] {
  const lines = Array.isArray(value) ? value : [];
  return lines.map((raw: unknown) => {
    const line = (raw ?? {}) as Record<string, unknown>;
    return {
      inventoryId:
        line.inventoryId === undefined ? undefined : String(line.inventoryId),
      medicationId: String(line.medicationId ?? ""),
      medicationName:
        line.medicationName === undefined
          ? undefined
          : String(line.medicationName),
      quantity: Number(line.quantity) || 1,
      shelfUnitPrice:
        Number(line.shelfUnitPrice ?? line.price) || 0,
    };
  });
}

@ApiTags("Insurance")
@ApiCookieAuth("pryrox_session")
@Controller("insurance")
export class InsuranceController {
  constructor(
    private readonly service: InsuranceService,
    private readonly auth: AuthService,
    private readonly tenant: TenantContextService,
    private readonly permissions: PharmacyPermissionService,
    private readonly audit: AuditService,
    private readonly ch: ClickhouseService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("analytics/monthly")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Insurance revenue analytics by month (ClickHouse-backed)" })
  @ApiQuery({ name: "months", required: false, type: Number, description: "Number of months to look back (default 12)" })
  async insuranceMonthlyAnalytics(
    @CurrentUser() user: AuthUser,
    @Query("months") months?: string,
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const m = Math.min(24, Math.max(1, parseInt(months ?? "12", 10) || 12));

      if (this.ch.isConfigured()) {
        try {
          return await this.ch.getInsuranceMonthlySummary(pharmacyId, m);
        } catch { /* fallback to Postgres */ }
      }

      // Postgres fallback — aggregate from sales
      const agg = await this.prisma.sales.aggregate({
        where: {
          pharmacy_id: pharmacyId,
          status: "completed",
          created_at: { gte: new Date(Date.now() - m * 30 * 86_400_000) },
        },
        _sum: { total_amount: true, insurance_amount: true, customer_amount: true },
      });
      const total = Math.round(Number(agg._sum.total_amount ?? 0));
      const insurance = Math.round(Number(agg._sum.insurance_amount ?? 0));
      return [{
        month: new Date().toISOString().slice(0, 7),
        insuranceRevenue: insurance,
        customerRevenue: Math.round(Number(agg._sum.customer_amount ?? 0)),
        totalRevenue: total,
        insuranceSharePercent: total > 0 ? Math.round((insurance / total) * 100) : 0,
      }];
    } catch (error) {
      console.error("GET /api/insurance/analytics/monthly", error);
      throw new HttpException({ error: "Failed to fetch insurance analytics" }, 500);
    }
  }

  @Get()
  @ApiOperation({
    summary: "List insurance providers",
    description:
      "Returns active global providers for anonymous callers, all providers for platform administrators, or active global and pharmacy-scoped providers for pharmacy users. Failures degrade to an empty array.",
  })
  @ApiOkResponse({
    description: "Insurance providers were returned.",
    type: InsuranceProviderDto,
    isArray: true,
  })
  @ApiResponse({ status: 500, description: "Failures return an empty array.", type: ErrorResponseDto })
  async list(@Req() request: Request) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) return this.service.listGlobalProviders();
      if (await this.service.isPlatformAdmin(user.id)) {
        return this.service.listAllProviders();
      }
      return this.service.listPharmacyProviders(
        await this.tenant.requirePharmacyId(user.id),
      );
    } catch (error) {
      console.error("GET /api/insurance", error);
      throw new HttpException({ error: "Failed to fetch insurance providers" }, 500);
    }
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: "Create an insurance provider" })
  @ApiBody({ type: CreateInsuranceProviderDto })
  @ApiOkResponse({ description: "Provider creation result.", type: ProviderMutationResponseDto })
  @ApiResponse({ status: 400, description: "Required provider fields are missing.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "Authentication is required.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The user cannot manage insurance providers.", type: ErrorResponseDto })
  async create(
    @Req() request: Request,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) {
        throw new HttpException(
          { success: false, error: "Unauthorized - Please login" },
          401,
        );
      }
      const platformAdmin = await this.service.isPlatformAdmin(user.id);
      let pharmacyId: string | null = null;
      if (!platformAdmin) {
        const context = await this.tenant.resolveActiveContext(user.id);
        if (!context.activePharmacyId) {
          throw new HttpException(
            {
              success: false,
              error: "User not associated with any pharmacy",
            },
            403,
          );
        }
        if (!["pharmacy_owner", "admin"].includes(context.role ?? "")) {
          throw new HttpException(
            { success: false, error: "Insufficient permissions" },
            403,
          );
        }
        pharmacyId = context.activePharmacyId;
      }
      if (!body.name || !body.coverage_percentage) {
        throw new HttpException(
          {
            success: false,
            error: "Name and coverage percentage are required",
          },
          400,
        );
      }
      const insurance = await this.service.createProvider({
        pharmacyId,
        name: String(body.name).trim(),
        coveragePercentage: Number.parseFloat(
          String(body.coverage_percentage),
        ),
        contactEmail: body.contact_email
          ? String(body.contact_email).trim()
          : null,
        contactPhone: body.contact_phone
          ? String(body.contact_phone).trim()
          : null,
        policyNumber: body.policy_number
          ? String(body.policy_number).trim()
          : null,
      });
      return {
        success: true,
        insurance,
        message: "Insurance provider added successfully",
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("POST /api/insurance", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to add insurance",
      };
    }
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update an insurance provider" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiBody({ type: UpdateInsuranceProviderDto })
  @ApiOkResponse({ description: "Provider update result.", type: ProviderMutationResponseDto })
  @ApiResponse({ status: 400, description: "The update payload is invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "Authentication is required.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The provider cannot be managed by this user.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The provider was not found.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The provider update failed.", type: ErrorResponseDto })
  async update(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      if (!id) {
        throw new HttpException({ success: false, error: "Missing id" }, 400);
      }
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) {
        throw new HttpException(
          { success: false, error: "Unauthorized" },
          401,
        );
      }
      const platformAdmin = await this.service.isPlatformAdmin(user.id);
      const existing = await this.service.findProviderById(id);
      if (!existing) {
        throw new HttpException(
          { success: false, error: "Provider not found" },
          404,
        );
      }
      if (!platformAdmin) {
        const context = await this.tenant.resolveActiveContext(user.id);
        if (!["pharmacy_owner", "admin"].includes(context.role ?? "")) {
          throw new HttpException(
            { success: false, error: "Forbidden" },
            403,
          );
        }
        const pharmacyId = await this.tenant.requirePharmacyId(user.id);
        if (existing.pharmacy_id !== pharmacyId) {
          throw new HttpException(
            { success: false, error: "Forbidden" },
            403,
          );
        }
      }
      const updates: Prisma.insurance_providersUpdateInput = {};
      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) {
          throw new HttpException(
            { success: false, error: "Name cannot be empty" },
            400,
          );
        }
        updates.name = name;
      }
      const percent =
        body.default_coverage_percent !== undefined
          ? clampCoveragePercent(body.default_coverage_percent)
          : body.coverage_percentage !== undefined
            ? clampCoveragePercent(body.coverage_percentage)
            : null;
      if (percent !== null) {
        updates.coverage_percentage = percent;
        updates.default_coverage_percent = percent;
      } else if (
        body.default_coverage_percent !== undefined ||
        body.coverage_percentage !== undefined
      ) {
        throw new HttpException(
          {
            success: false,
            error: "Coverage percent must be between 0 and 100",
          },
          400,
        );
      }
      if (body.contact_email !== undefined) {
        updates.contact_email = body.contact_email
          ? String(body.contact_email).trim()
          : null;
      }
      if (body.contact_phone !== undefined) {
        updates.contact_phone = body.contact_phone
          ? String(body.contact_phone).trim()
          : null;
      }
      if (body.policy_number !== undefined) {
        updates.policy_number = body.policy_number
          ? String(body.policy_number).trim()
          : null;
      }
      if (body.is_active !== undefined) {
        updates.is_active = Boolean(body.is_active);
      }
      if (!Object.keys(updates).length) {
        throw new HttpException(
          { success: false, error: "No fields to update" },
          400,
        );
      }
      const insurance = await this.service.updateProvider(id, updates);
      return {
        success: true,
        insurance,
        message: "Insurance provider updated",
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("PATCH /api/insurance/[id]", error);
      throw new HttpException(
        {
          success: false,
          error: error instanceof Error ? error.message : "Update failed",
        },
        500,
      );
    }
  }

  @Post("lookup")
  @HttpCode(200)
  @ApiOperation({ summary: "Look up a customer insurance membership" })
  @ApiBody({ type: InsuranceLookupDto })
  @ApiOkResponse({ description: "The membership was found.", type: LookupResponseDto })
  @ApiResponse({ status: 400, description: "The membership number is missing.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "Authentication is required.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The membership was not found.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The lookup failed.", type: ErrorResponseDto })
  async lookup(
    @Req() request: Request,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const membership = String(body.insuranceNumber ?? "").trim();
      if (!membership) {
        throw new HttpException(
          { success: false, error: "Insurance number is required" },
          400,
        );
      }
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) {
        throw new HttpException(
          { success: false, error: "Unauthorized" },
          401,
        );
      }
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const customer = await this.service.findCustomerByInsuranceNumber(
        pharmacyId,
        membership,
      );
      if (!customer) {
        throw new HttpException(
          {
            success: false,
            error: "Membership not found for this pharmacy",
          },
          404,
        );
      }
      let insuranceType: string | undefined;
      let coveragePercent = 90;
      if (customer.insurance_provider_id) {
        const provider = await this.service.resolveProvider(
          pharmacyId,
          customer.insurance_provider_id,
        );
        if (provider) {
          insuranceType = provider.name;
          coveragePercent = provider.coveragePercent;
        }
      }
      return {
        success: true,
        customerId: customer.id,
        customerName: customer.name,
        insuranceType: insuranceType ?? "RSSB",
        coveragePercent,
        status: "active",
        source: "customers",
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("POST /api/insurance/lookup", error);
      throw new HttpException(
        { success: false, error: "Lookup failed" },
        500,
      );
    }
  }

  @Get("pricing")
  @ApiOperation({ summary: "Get insurance-aware medication pricing" })
  @ApiQuery({ name: "insurance", required: false, type: String })
  @ApiQuery({ name: "medicationId", required: false, type: String })
  @ApiQuery({ name: "product", required: false, type: String })
  @ApiOkResponse({ description: "Pricing or a null-price fallback.", type: PricingResponseDto })
  @ApiResponse({ status: 500, description: "Failures return a null price.", type: ErrorResponseDto })
  async pricing(
    @Req() request: Request,
    @Query("insurance") insurance?: string,
    @Query("medicationId") medicationId?: string,
    @Query("product") product?: string,
  ) {
    try {
      if (!insurance) return { price: null };
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) return { price: null };
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      let resolvedMedicationId = medicationId;
      if (!resolvedMedicationId && product) {
        resolvedMedicationId = (
          await this.service.findMedicationByName(pharmacyId, product.trim())
        )?.id;
      }
      if (!resolvedMedicationId) {
        return { price: null, reason: "medication_not_found" };
      }
      const shelf = await this.service.findInventorySellingPrice(
        pharmacyId,
        resolvedMedicationId,
      );
      const totals = await this.service.computeCoverage({
        pharmacyId,
        providerIdOrName: insurance,
        lines: [
          {
            medicationId: resolvedMedicationId,
            quantity: 1,
            shelfUnitPrice: shelf,
          },
        ],
      });
      const line = totals?.lines[0];
      return {
        price: line?.isCovered ? shelf : null,
        isCovered: line?.isCovered ?? false,
        coveragePercent: line?.coveragePercent ?? null,
        reason: line?.reason ?? null,
      };
    } catch (error) {
      console.error("GET /api/insurance/pricing", error);
      return { price: null };
    }
  }

  @Post("pricing")
  @HttpCode(200)
  @ApiOperation({ summary: "Mark medications covered by product name" })
  @ApiBody({ type: InsurancePricingUpdateDto })
  @ApiOkResponse({ description: "Coverage update result.", type: CoverageUpdateResponseDto })
  @ApiResponse({ status: 400, description: "Required fields are missing.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "Authentication is required.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The provider was not found.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Coverage updates failed.", type: ErrorResponseDto })
  async updatePricing(
    @Req() request: Request,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) {
        throw new HttpException(
          { success: false, error: "Unauthorized" },
          401,
        );
      }
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      if (
        !body.insurance ||
        !body.priceList ||
        typeof body.priceList !== "object"
      ) {
        throw new HttpException(
          { success: false, error: "insurance and priceList required" },
          400,
        );
      }
      const provider = await this.service.resolveProvider(
        pharmacyId,
        String(body.insurance),
      );
      if (!provider) {
        throw new HttpException(
          { success: false, error: "Provider not found" },
          404,
        );
      }
      let updated = 0;
      const errors: string[] = [];
      for (const medicationName of Object.keys(
        body.priceList as Record<string, unknown>,
      )) {
        const medication = await this.service.findMedicationByName(
          pharmacyId,
          medicationName.trim(),
        );
        if (!medication?.id) {
          errors.push(`Unknown medication: ${medicationName}`);
          continue;
        }
        try {
          await this.service.markMedicationCovered({
            pharmacyId,
            medicationId: medication.id,
            providerId: provider.id,
          });
          updated += 1;
        } catch (error) {
          errors.push(
            `${medicationName}: ${error instanceof Error ? error.message : "update failed"}`,
          );
        }
      }
      return {
        success: errors.length === 0,
        upserted: updated,
        errors: errors.length ? errors : undefined,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("POST /api/insurance/pricing", error);
      throw new HttpException(
        { success: false, error: "Coverage update failed" },
        500,
      );
    }
  }

  @Post("process")
  @HttpCode(200)
  @ApiOperation({ summary: "Process and save an insurance claim" })
  @ApiBody({ type: ProcessInsuranceDto })
  @ApiOkResponse({ description: "The claim was saved.", type: ProcessInsuranceResponseDto })
  @ApiResponse({ status: 401, description: "Authentication is required.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The provider was not found.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Claim processing failed.", type: ErrorResponseDto })
  async process(
    @Req() request: Request,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) {
        throw new HttpException(
          { success: false, error: "Unauthorized" },
          401,
        );
      }
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const provider = await this.service.resolveProvider(
        pharmacyId,
        String(body.insuranceType ?? body.insurance ?? ""),
      );
      if (!provider) {
        throw new HttpException(
          {
            success: false,
            error: "Insurance provider not found",
          },
          404,
        );
      }
      const lines = coverageLines(body.lines);
      let insuranceCoverage = Number(body.insuranceCoverage) || 0;
      let patientCopay =
        Number(body.patientCopay ?? body.patientAmount) || 0;
      let subtotal = Number(body.totalAmount ?? body.subtotal) || 0;
      let computedLines: CoverageLineResult[] = [];
      if (lines.length) {
        const totals = await this.service.computeCoverage({
          pharmacyId,
          providerIdOrName: provider.id,
          lines,
        });
        if (totals) {
          insuranceCoverage = totals.insuranceCoverage;
          patientCopay = totals.patientCopay;
          subtotal = totals.subtotal;
          computedLines = totals.lines;
        }
      }
      const metadata =
        body.metadata && typeof body.metadata === "object"
          ? body.metadata
          : {
              tinInsurance: body.tinInsurance,
              ordonnanceNumber: body.ordonnanceNumber,
              prescriberName: body.prescriberName,
              hsp: body.hsp,
              physicianOrderNumber: body.physicianOrderNumber,
              tinPatient: body.tinPatient,
              amountPaid: body.amountPaid,
              paymentType: body.paymentType,
              transactionId: body.transactionId,
              validityRate: body.validityRate,
            };
      const claim = await this.service.createClaim({
        pharmacyId,
        saleId: body.saleId ? String(body.saleId) : null,
        providerId: provider.id,
        patientName: String(
          body.patientName ?? body.clientName ?? "Unknown",
        ),
        patientIdNumber: String(
          body.patientId ?? body.patient_id ?? body.patientNumber ?? "",
        ),
        claimAmount: insuranceCoverage,
        patientCopay,
        notes: body.notes === undefined ? null : String(body.notes),
        metadata,
      });
      if (computedLines.length) {
        await this.service.insertClaimLines({
          claimId: claim.id,
          pharmacyId,
          providerId: provider.id,
          lines: computedLines,
        });
      }
      return {
        success: true,
        claim: {
          claimId: claim.id,
          claimNumber: claim.claim_number,
          approvalCode: claim.claim_number,
          status: claim.status,
        },
        totals: { subtotal, insuranceCoverage, patientCopay },
        message: "Insurance claim saved",
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("Insurance processing error:", error);
      throw new HttpException(
        {
          success: false,
          error: "Failed to process insurance claim",
        },
        500,
      );
    }
  }

  @Post("coverage/preview")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Preview insurance coverage totals" })
  @ApiBody({ type: CoveragePreviewDto })
  @ApiOkResponse({ description: "Computed line and total coverage.", type: CoverageResponseDto })
  @ApiResponse({ status: 400, description: "The provider is missing.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "Authentication is required.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The provider was not found.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Coverage preview failed.", type: ErrorResponseDto })
  async preview(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const providerIdOrName = String(
        body.providerId ?? body.insuranceType ?? body.insurance ?? "",
      ).trim();
      if (!providerIdOrName) {
        throw new HttpException(
          { error: "Insurance provider is required" },
          400,
        );
      }
      const totals = await this.service.computeCoverage({
        pharmacyId,
        providerIdOrName,
        lines: coverageLines(body.lines),
      });
      if (!totals) {
        throw new HttpException(
          { error: "Insurance provider not found" },
          404,
        );
      }
      return { success: true, ...totals };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("POST /api/insurance/coverage/preview", error);
      throw new HttpException(
        {
          error:
            error instanceof Error
              ? error.message
              : "Coverage preview failed",
        },
        500,
      );
    }
  }

  @Post("formulary/apply")
  @HttpCode(200)
  @ApiOperation({ summary: "Apply formulary coverage to medications" })
  @ApiBody({ type: ApplyFormularyDto })
  @ApiOkResponse({ description: "Per-medication formulary application result.", type: ApplyFormularyResponseDto })
  @ApiResponse({ status: 400, description: "The request is empty or exceeds the batch limit.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The provider was not found.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Formulary application failed.", type: ErrorResponseDto })
  async applyFormulary(
    @Req() request: Request,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) return { success: false, error: "Unauthorized" };
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const insurance = String(body.insurance ?? "").trim();
      const items = (body.items ?? []) as Array<{
        medicationId?: string;
        externalCode?: string;
      }>;
      if (!insurance) {
        throw new HttpException(
          { success: false, error: "insurance is required" },
          400,
        );
      }
      if (items.length === 0) {
        throw new HttpException(
          { success: false, error: "No confirmed items to apply" },
          400,
        );
      }
      if (items.length > MAX_IMPORT_ROWS) {
        throw new HttpException(
          {
            success: false,
            error: `Import limited to ${MAX_IMPORT_ROWS} rows per batch`,
          },
          400,
        );
      }
      const provider = await this.service.resolveProvider(
        pharmacyId,
        insurance,
      );
      if (!provider) {
        throw new HttpException(
          { success: false, error: "Provider not found" },
          404,
        );
      }
      const failures: Array<{ medicationId: string; error: string }> = [];
      let applied = 0;
      for (const item of items) {
        const medicationId = String(item.medicationId ?? "").trim();
        if (!medicationId) continue;
        const medication = await this.service.findMedication(
          pharmacyId,
          medicationId,
        );
        if (!medication) {
          failures.push({
            medicationId,
            error: "Medication not found in your catalog",
          });
          continue;
        }
        try {
          await this.service.markMedicationCovered({
            pharmacyId,
            medicationId,
            providerId: provider.id,
            externalCode: item.externalCode?.trim() || undefined,
          });
          applied += 1;
        } catch (error) {
          failures.push({
            medicationId,
            error: error instanceof Error ? error.message : "Update failed",
          });
        }
      }
      return { success: failures.length === 0, applied, failures };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("POST /api/insurance/formulary/apply", error);
      throw new HttpException(
        {
          success: false,
          error: "Failed to apply formulary coverage",
        },
        500,
      );
    }
  }

  @Patch("claims/:id/status")
  @ApiOperation({ summary: "Transition an insurance claim status" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiBody({ type: UpdateClaimStatusDto })
  @ApiOkResponse({ description: "The claim status was updated.", type: UpdateClaimStatusResponseDto })
  @ApiResponse({ status: 400, description: "The status or transition is invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "Authentication is required.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The user lacks reports access.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The claim was not found.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The status update failed.", type: ErrorResponseDto })
  async updateClaimStatus(
    @Req() request: Request,
    @Param("id") claimId: string,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) {
        throw new HttpException(
          { success: false, error: "Unauthorized" },
          401,
        );
      }
      await this.permissions.requirePharmacyPermission(
        user.id,
        PHARMACY_PERMISSIONS.reportsView,
      );
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const status = body.status;
      if (!status || typeof status !== "string") {
        throw new HttpException(
          { success: false, error: "status is required" },
          400,
        );
      }
      if (!VALID_STATUSES.includes(status)) {
        throw new HttpException(
          {
            success: false,
            error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
          },
          400,
        );
      }
      const claim = await this.service.findClaim(claimId);
      if (!claim || claim.pharmacy_id !== pharmacyId) {
        throw new HttpException(
          { success: false, error: "Claim not found" },
          404,
        );
      }
      const currentStatus = claim.status ?? "pending";
      const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
      if (!allowed.includes(status)) {
        throw new HttpException(
          {
            success: false,
            error: `Cannot transition from "${currentStatus}" to "${status}". Allowed: ${allowed.length > 0 ? allowed.join(", ") : "none (terminal state)"}`,
          },
          400,
        );
      }
      const data: Prisma.insurance_claimsUpdateInput = {
        status: status as Prisma.insurance_claimsUpdateInput["status"],
        updated_at: new Date(),
      };
      if (status === "approved" || status === "rejected") {
        data.processed_at = new Date();
      }
      if (status === "approved" && body.approvedAmount !== undefined) {
        data.approved_amount = Number(body.approvedAmount);
      }
      if (body.notes !== undefined) data.notes = String(body.notes);
      const updated = await this.service.updateClaimStatus(claimId, data);
      await this.audit.writeAuditLog({
        pharmacyId,
        userId: user.id,
        action: "UPDATE",
        tableName: "insurance_claims",
        recordId: claimId,
        oldValues: { status: currentStatus },
        newValues: {
          status,
          ...(body.notes ? { notes: body.notes } : {}),
          ...(body.approvedAmount !== undefined
            ? { approved_amount: body.approvedAmount }
            : {}),
        },
        ipAddress: request.ip,
        userAgent: request.get("user-agent"),
      });
      return {
        success: true,
        claim: {
          id: updated.id,
          status: updated.status,
          approved_amount: updated.approved_amount,
          processed_at: updated.processed_at?.toISOString() ?? null,
          notes: updated.notes,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("PATCH /api/insurance/claims/[id]/status", error);
      throw new HttpException(
        {
          success: false,
          error: "Failed to update claim status",
        },
        500,
      );
    }
  }
}
