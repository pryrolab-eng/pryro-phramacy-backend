import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CoverageLineInput,
  CoverageLineResult,
  CoverageTotals,
  MedicationInsuranceCoverageMap,
  MedicationProviderCoverage,
  ResolvedInsuranceProvider,
} from "./models/insurance.types";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function parseCoverage(raw: unknown): MedicationInsuranceCoverageMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: MedicationInsuranceCoverageMap = {};
  for (const [providerId, value] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    result[providerId] = {
      covered:
        entry.covered === undefined ? undefined : Boolean(entry.covered),
      externalCode:
        typeof entry.externalCode === "string"
          ? entry.externalCode
          : undefined,
      notes: typeof entry.notes === "string" ? entry.notes : undefined,
      effectiveFrom:
        typeof entry.effectiveFrom === "string"
          ? entry.effectiveFrom
          : undefined,
      effectiveTo:
        entry.effectiveTo === null || typeof entry.effectiveTo === "string"
          ? (entry.effectiveTo as string | null)
          : undefined,
    };
  }
  return result;
}

function mergeCoverage(
  coverage: MedicationInsuranceCoverageMap,
  providerId: string,
  patch: Partial<MedicationProviderCoverage>,
): MedicationInsuranceCoverageMap {
  return {
    ...coverage,
    [providerId]: { ...(coverage[providerId] ?? {}), ...patch },
  };
}

function parseDateOnly(value: string): Date | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const date = new Date(`${trimmed}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isCoverageActive(
  entry: MedicationProviderCoverage,
  refDate = new Date(),
): boolean {
  const ref = refDate.toISOString().slice(0, 10);
  if (
    entry.effectiveFrom &&
    parseDateOnly(entry.effectiveFrom) &&
    ref < entry.effectiveFrom
  ) {
    return false;
  }
  if (
    entry.effectiveTo &&
    parseDateOnly(entry.effectiveTo) &&
    ref > entry.effectiveTo
  ) {
    return false;
  }
  return true;
}

@Injectable()
export class InsuranceService {
  constructor(private readonly prisma: PrismaService) {}

  isPlatformAdmin(userId: string): Promise<boolean> {
    return this.prisma.public_users
      .findUnique({
        where: { id: userId },
        select: { is_platform_admin: true },
      })
      .then((row) => row?.is_platform_admin === true);
  }

  listGlobalProviders() {
    return this.prisma.insurance_providers.findMany({
      where: { pharmacy_id: null, is_active: true },
      orderBy: { name: "asc" },
    });
  }

  listAllProviders() {
    return this.prisma.insurance_providers.findMany({
      orderBy: { created_at: "desc" },
    });
  }

  listPharmacyProviders(pharmacyId: string) {
    return this.prisma.insurance_providers.findMany({
      where: {
        is_active: true,
        OR: [{ pharmacy_id: pharmacyId }, { pharmacy_id: null }],
      },
      orderBy: { name: "asc" },
    });
  }

  createProvider(input: {
    pharmacyId: string | null;
    name: string;
    coveragePercentage: number;
    contactEmail: string | null;
    contactPhone: string | null;
    policyNumber: string | null;
  }) {
    return this.prisma.insurance_providers.create({
      data: {
        pharmacy_id: input.pharmacyId,
        name: input.name,
        coverage_percentage: input.coveragePercentage,
        default_coverage_percent: input.coveragePercentage,
        contact_email: input.contactEmail,
        contact_phone: input.contactPhone,
        policy_number: input.policyNumber,
        is_active: true,
      },
    });
  }

  findProviderById(id: string) {
    return this.prisma.insurance_providers.findUnique({
      where: { id },
      select: { id: true, pharmacy_id: true, name: true },
    });
  }

  updateProvider(
    id: string,
    updates: Prisma.insurance_providersUpdateInput,
  ) {
    return this.prisma.insurance_providers.update({
      where: { id },
      data: { ...updates, updated_at: new Date() },
    });
  }

  async resolveProvider(
    pharmacyId: string,
    providerIdOrName: string,
  ): Promise<ResolvedInsuranceProvider | null> {
    const key = providerIdOrName.trim();
    if (!key) return null;
    const select = {
      id: true,
      name: true,
      coverage_percentage: true,
      default_coverage_percent: true,
      integration_type: true,
    } as const;
    const row = isUuid(key)
      ? await this.prisma.insurance_providers.findUnique({
          where: { id: key, is_active: true },
          select,
        })
      : (await this.prisma.insurance_providers.findFirst({
          where: {
            is_active: true,
            pharmacy_id: pharmacyId,
            name: { equals: key, mode: "insensitive" },
          },
          select,
        })) ??
        (await this.prisma.insurance_providers.findFirst({
          where: {
            is_active: true,
            pharmacy_id: null,
            name: { equals: key, mode: "insensitive" },
          },
          select,
        }));
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      coveragePercent: Number(
        row.default_coverage_percent ?? row.coverage_percentage ?? 0,
      ),
      integrationType: row.integration_type ?? "manual",
    };
  }

  findCustomerByInsuranceNumber(
    pharmacyId: string,
    insuranceNumber: string,
  ) {
    return this.prisma.customers.findFirst({
      where: { pharmacy_id: pharmacyId, insurance_number: insuranceNumber },
      select: {
        id: true,
        name: true,
        phone: true,
        insurance_number: true,
        insurance_provider_id: true,
      },
    });
  }

  findMedicationByName(pharmacyId: string, name: string) {
    return this.prisma.medications.findFirst({
      where: {
        pharmacy_id: pharmacyId,
        name: { equals: name.trim(), mode: "insensitive" },
      },
      select: { id: true, name: true, insurance_coverage: true },
    });
  }

  async findInventorySellingPrice(
    pharmacyId: string,
    medicationId: string,
  ): Promise<number> {
    const row = await this.prisma.inventory.findFirst({
      where: {
        pharmacy_id: pharmacyId,
        medication_id: medicationId,
        quantity_in_stock: { gt: 0 },
      },
      select: { selling_price: true },
      orderBy: { created_at: "desc" },
    });
    return row ? Number(row.selling_price ?? 0) : 0;
  }

  private async loadCoverage(
    pharmacyId: string,
    medicationIds: string[],
  ): Promise<Map<string, MedicationInsuranceCoverageMap>> {
    const ids = Array.from(new Set(medicationIds.filter(Boolean)));
    const result = new Map<string, MedicationInsuranceCoverageMap>();
    if (!ids.length) return result;
    const rows = await this.prisma.medications.findMany({
      where: { pharmacy_id: pharmacyId, id: { in: ids } },
      select: { id: true, insurance_coverage: true },
    });
    for (const row of rows) {
      result.set(row.id, parseCoverage(row.insurance_coverage));
    }
    return result;
  }

  private computeLine(
    line: CoverageLineInput,
    providerCoveragePercent: number,
    providerId: string,
    medicationCoverage?: MedicationInsuranceCoverageMap,
  ): CoverageLineResult {
    const quantity = Math.max(0, line.quantity);
    const shelfUnitPrice = Math.max(0, line.shelfUnitPrice);
    const lineTotal = shelfUnitPrice * quantity;
    const entry = medicationCoverage?.[providerId];
    if (!entry || !isCoverageActive(entry)) {
      return {
        ...line,
        quantity,
        shelfUnitPrice,
        isCovered: false,
        insuredUnitPrice: shelfUnitPrice,
        coveragePercent: 0,
        insurerPays: 0,
        patientPays: lineTotal,
        reason: "not_listed",
      };
    }
    if (entry.covered !== true) {
      return {
        ...line,
        quantity,
        shelfUnitPrice,
        isCovered: false,
        insuredUnitPrice: shelfUnitPrice,
        coveragePercent: 0,
        insurerPays: 0,
        patientPays: lineTotal,
        reason: "not_covered",
      };
    }
    const percent = providerCoveragePercent / 100;
    const insurerPays = Math.round(lineTotal * percent);
    return {
      ...line,
      quantity,
      shelfUnitPrice,
      isCovered: percent > 0,
      insuredUnitPrice: shelfUnitPrice,
      coveragePercent: providerCoveragePercent,
      insurerPays,
      patientPays: Math.max(0, lineTotal - insurerPays),
      reason: "covered",
    };
  }

  async computeCoverage(input: {
    pharmacyId: string;
    providerIdOrName: string;
    lines: CoverageLineInput[];
  }): Promise<CoverageTotals | null> {
    const provider = await this.resolveProvider(
      input.pharmacyId,
      input.providerIdOrName,
    );
    if (!provider) return null;
    const coverage = await this.loadCoverage(
      input.pharmacyId,
      input.lines.map((line) => line.medicationId),
    );
    const lines = input.lines.map((line) =>
      this.computeLine(
        line,
        provider.coveragePercent,
        provider.id,
        coverage.get(line.medicationId),
      ),
    );
    const insuranceCoverage = lines.reduce(
      (sum, line) => sum + line.insurerPays,
      0,
    );
    const patientCopay = lines.reduce(
      (sum, line) => sum + line.patientPays,
      0,
    );
    return {
      subtotal: insuranceCoverage + patientCopay,
      insuranceCoverage,
      patientCopay,
      lines,
    };
  }

  async markMedicationCovered(input: {
    pharmacyId: string;
    medicationId: string;
    providerId: string;
    externalCode?: string;
  }): Promise<void> {
    const coverageMap = await this.loadCoverage(input.pharmacyId, [
      input.medicationId,
    ]);
    const merged = mergeCoverage(
      coverageMap.get(input.medicationId) ?? {},
      input.providerId,
      {
        covered: true,
        ...(input.externalCode
          ? { externalCode: input.externalCode }
          : {}),
      },
    );
    await this.prisma.medications.update({
      where: { id: input.medicationId },
      data: {
        insurance_coverage: merged as Prisma.InputJsonValue,
        updated_at: new Date(),
      },
    });
  }

  findMedication(pharmacyId: string, medicationId: string) {
    return this.prisma.medications.findFirst({
      where: { id: medicationId, pharmacy_id: pharmacyId },
      select: { id: true, name: true },
    });
  }

  async createClaim(input: {
    pharmacyId: string;
    saleId: string | null;
    providerId: string;
    patientName: string;
    patientIdNumber: string;
    claimAmount: number;
    patientCopay: number;
    notes: string | null;
    metadata: unknown;
  }) {
    return this.prisma.insurance_claims.create({
      data: {
        pharmacy_id: input.pharmacyId,
        sale_id: input.saleId,
        insurance_provider_id: input.providerId,
        patient_name: input.patientName,
        patient_id_number: input.patientIdNumber,
        claim_amount: input.claimAmount,
        covered_amount: input.claimAmount,
        patient_copay: input.patientCopay,
        approved_amount: 0,
        status: "pending",
        notes: input.notes,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
      select: { id: true, claim_number: true, status: true },
    });
  }

  async insertClaimLines(input: {
    claimId: string;
    pharmacyId: string;
    providerId: string;
    lines: CoverageLineResult[];
  }): Promise<void> {
    const coverageMap = await this.loadCoverage(
      input.pharmacyId,
      input.lines.map((line) => line.medicationId),
    );
    const rows = input.lines
      .filter((line) => line.medicationId)
      .map((line) => ({
        claim_id: input.claimId,
        sale_item_id: null,
        medication_id: line.medicationId,
        medication_name: line.medicationName ?? null,
        quantity: line.quantity,
        is_covered: line.isCovered,
        shelf_unit_price: line.shelfUnitPrice,
        insured_unit_price: line.insuredUnitPrice,
        insurer_amount: line.insurerPays,
        patient_amount: line.patientPays,
        external_code:
          coverageMap.get(line.medicationId)?.[input.providerId]?.externalCode?.trim() ||
          null,
      }));
    if (rows.length) {
      await this.prisma.insurance_claim_lines.createMany({ data: rows });
    }
  }

  findClaim(claimId: string) {
    return this.prisma.insurance_claims.findUnique({
      where: { id: claimId },
      select: {
        id: true,
        pharmacy_id: true,
        status: true,
        claim_amount: true,
        patient_name: true,
      },
    });
  }

  updateClaimStatus(
    claimId: string,
    data: Prisma.insurance_claimsUpdateInput,
  ) {
    return this.prisma.insurance_claims.update({
      where: { id: claimId },
      data,
    });
  }
}
