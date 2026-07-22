export type PrescriptionConfirmation = {
  confirmed: boolean;
  patientName?: string;
  prescriberName?: string;
  notes?: string;
};

export type SaleLine = {
  id: string;
  name?: string;
  quantity: number;
  price?: number;
  batch?: string;
  expiryDate?: string | null;
  daysToExpiry?: number;
  requiresPrescription?: boolean;
};

export type ReturnDisposition = "restock" | "damaged" | "destroy";

export type ReturnLinePayload = {
  saleItemId: string;
  inventoryId: string;
  quantity: number;
  disposition?: ReturnDisposition;
};

export type CoverageLineResult = {
  inventoryId?: string;
  medicationId: string;
  medicationName?: string;
  quantity: number;
  isCovered: boolean;
  shelfUnitPrice: number;
  insuredUnitPrice: number;
  coveragePercent: number;
  insurerPays: number;
  patientPays: number;
  reason: "covered" | "not_covered" | "not_listed";
};

export type ShiftRow = {
  id: string;
  pharmacy_id: string;
  branch_id: string;
  cashier_id: string;
  status: string;
  opening_cash: number;
  expected_cash: number | null;
  actual_cash: number | null;
  cash_variance: number | null;
  total_sales: number | null;
  total_refunds: number | null;
  transaction_count: number | null;
  opened_at: Date;
  closed_at: Date | null;
  close_notes: string | null;
  created_at: Date | null;
  updated_at: Date | null;
};

export function readString(
  body: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function readNumber(
  body: Record<string, unknown>,
  ...keys: string[]
): number {
  for (const key of keys) {
    const value = body[key];
    if (value === undefined || value === null || value === "") continue;
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

export function computeDaysToExpiry(
  expiryDate: string | null | undefined,
): number {
  if (!expiryDate) return 9999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return 9999;
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
}

export function defaultDispositionForReason(
  reason: string,
): ReturnDisposition {
  if (reason === "expired") return "destroy";
  if (reason === "defective") return "damaged";
  return "restock";
}

export function isDispositionAllowed(
  reason: string,
  disposition: ReturnDisposition,
): boolean {
  return !(
    disposition === "restock" &&
    (reason === "expired" || reason === "defective")
  );
}

export function stockMovementTypeForDisposition(
  disposition: ReturnDisposition,
): string {
  if (disposition === "damaged") return "damaged";
  if (disposition === "destroy") return "expired";
  return "in";
}

export function serializeShift(row: ShiftRow): Record<string, unknown> {
  return {
    id: row.id,
    pharmacy_id: row.pharmacy_id,
    branch_id: row.branch_id,
    cashier_id: row.cashier_id,
    status: row.status,
    opening_cash: row.opening_cash,
    expected_cash: row.expected_cash,
    actual_cash: row.actual_cash,
    cash_variance: row.cash_variance,
    total_sales: row.total_sales,
    total_refunds: row.total_refunds,
    transaction_count: row.transaction_count,
    opened_at: row.opened_at.toISOString(),
    closed_at: row.closed_at?.toISOString() ?? null,
    close_notes: row.close_notes,
    created_at: row.created_at?.toISOString() ?? null,
    updated_at: row.updated_at?.toISOString() ?? null,
  };
}
