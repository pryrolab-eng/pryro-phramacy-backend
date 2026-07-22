export type MedicationProviderCoverage = {
  covered?: boolean;
  externalCode?: string;
  notes?: string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
};

export type MedicationInsuranceCoverageMap = Record<
  string,
  MedicationProviderCoverage
>;

export type CoverageLineInput = {
  inventoryId?: string;
  medicationId: string;
  medicationName?: string;
  quantity: number;
  shelfUnitPrice: number;
};

export type CoverageLineResult = CoverageLineInput & {
  isCovered: boolean;
  insuredUnitPrice: number;
  coveragePercent: number;
  insurerPays: number;
  patientPays: number;
  reason?: "covered" | "not_covered" | "not_listed";
};

export type CoverageTotals = {
  subtotal: number;
  insuranceCoverage: number;
  patientCopay: number;
  lines: CoverageLineResult[];
};

export type ResolvedInsuranceProvider = {
  id: string;
  name: string;
  coveragePercent: number;
  integrationType: string;
};
