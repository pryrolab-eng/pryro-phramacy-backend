import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class PosBranchQueryDto {
  @ApiPropertyOptional({
    description: "Branch UUID used to scope the POS operation.",
    example: "8150740a-5ee8-4f92-8337-a72c7e390b9e",
  })
  branchId?: string;
}

export class PosProductDto {
  @ApiProperty({ description: "Inventory batch UUID.", example: "74c56b77-54bf-42a3-aab9-8bc3a80d9104" })
  id!: string;

  @ApiProperty({ description: "Medication UUID.", example: "2f754af4-d26b-4d57-b33f-77d9328722cd" })
  medicationId!: string;

  @ApiProperty({ description: "Medication display name.", example: "Amoxicillin 500mg" })
  name!: string;

  @ApiProperty({ description: "Selling price per unit.", example: 2500 })
  price!: number;

  @ApiProperty({ description: "Available units in this batch.", example: 42 })
  stock!: number;

  @ApiProperty({ description: "Batch number.", example: "AMX-2026-04" })
  batch!: string;

  @ApiPropertyOptional({ description: "Expiry date in YYYY-MM-DD format.", example: "2027-04-30", nullable: true })
  expiryDate?: string | null;

  @ApiProperty({ description: "Whole days until expiry.", example: 283 })
  daysToExpiry!: number;

  @ApiProperty({ description: "Whether prescription confirmation is required.", example: true })
  requiresPrescription!: boolean;
}

export class PosDiscountRequestDto {
  @ApiProperty({ description: "Discount display name.", example: "Senior discount" })
  name!: string;

  @ApiProperty({ description: "Discount calculation type.", example: "percentage" })
  type!: string;

  @ApiProperty({ description: "Discount value.", example: 10 })
  value!: number;

  @ApiPropertyOptional({ description: "Legacy pharmacy UUID override.", example: "7d0f76bd-c82d-4d33-b94a-44fd93ea1502" })
  pharmacy_id?: string;
}

export class HoldSaleRequestDto {
  @ApiPropertyOptional({ description: "Branch UUID; defaults to the user's active branch.", example: "8150740a-5ee8-4f92-8337-a72c7e390b9e" })
  branchId?: string;

  @ApiPropertyOptional({ description: "Selected customer object.", example: { id: "3b5a6248-3e85-4b44-9f7f-9cd0a0da21c5", name: "Aline Uwase" } })
  customer?: Record<string, unknown>;

  @ApiProperty({ description: "Cart lines to retain.", example: [{ id: "74c56b77-54bf-42a3-aab9-8bc3a80d9104", quantity: 2, price: 2500 }] })
  cart!: Array<Record<string, unknown>>;
}

export class ShiftActionRequestDto {
  @ApiProperty({ description: "Shift action.", enum: ["open", "close"], example: "open" })
  action!: "open" | "close";

  @ApiProperty({ description: "Branch UUID.", example: "8150740a-5ee8-4f92-8337-a72c7e390b9e" })
  branchId!: string;

  @ApiPropertyOptional({ description: "Opening cash amount for an open action.", example: 50000 })
  openingCash?: number;

  @ApiPropertyOptional({ description: "Shift UUID for a close action.", example: "d99957a6-8585-467e-90f5-173dc411ea31" })
  shiftId?: string;

  @ApiPropertyOptional({ description: "Counted cash amount for a close action.", example: 132500 })
  actualCash?: number;

  @ApiPropertyOptional({ description: "Optional closing notes.", example: "Till reconciled" })
  closeNotes?: string;
}

export class QuickAddCategoryRequestDto {
  @ApiProperty({ description: "Category name. The alias `name` is also accepted.", example: "Antibiotics" })
  categoryName!: string;

  @ApiPropertyOptional({ description: "Category description. The alias `description` is also accepted.", example: "Anti-infective medicines" })
  categoryDescription?: string;
}

export class QuickAddPatientRequestDto {
  @ApiProperty({ description: "Patient name. The alias `name` is also accepted.", example: "Aline Uwase" })
  patientName!: string;

  @ApiProperty({ description: "Phone number. The alias `phone` is also accepted.", example: "+250788123456" })
  phoneNumber!: string;

  @ApiPropertyOptional({ description: "Insurance member number.", example: "RSSB-104920" })
  insuranceNumber?: string;
}

export class QuickAddDrugRequestDto {
  @ApiProperty({ description: "Product name. The alias `name` is also accepted.", example: "Amoxicillin 500mg" })
  productName!: string;

  @ApiProperty({ description: "Medication category name.", example: "Antibiotics" })
  category!: string;

  @ApiPropertyOptional({ description: "Manufacturer name.", example: "Pryrox Labs" })
  manufacturer?: string;

  @ApiPropertyOptional({ description: "Barcode value.", example: "6151100001234" })
  barcode?: string;

  @ApiPropertyOptional({ description: "Initial stock quantity.", example: 100 })
  initialStock?: number;

  @ApiPropertyOptional({ description: "Purchase price per unit.", example: 1700 })
  purchasePrice?: number;

  @ApiPropertyOptional({ description: "Selling price per unit.", example: 2500 })
  unitPrice?: number;

  @ApiPropertyOptional({ description: "Low-stock threshold.", example: 10 })
  minStockAlert?: number;

  @ApiPropertyOptional({ description: "Batch expiry date.", example: "2027-04-30" })
  expiryDate?: string;
}

export class QuickAddInsuranceRequestDto {
  @ApiProperty({ description: "Insurance provider name.", example: "RSSB" })
  insuranceName!: string;

  @ApiProperty({ description: "Default coverage percentage.", example: 85 })
  coveragePercentage!: number;
}

export class PosSaleRequestDto {
  @ApiProperty({ description: "Branch UUID. The alias `branch_id` is also accepted.", example: "8150740a-5ee8-4f92-8337-a72c7e390b9e" })
  branchId!: string;

  @ApiProperty({ description: "Inventory batch sale lines.", example: [{ id: "74c56b77-54bf-42a3-aab9-8bc3a80d9104", name: "Amoxicillin 500mg", quantity: 2, price: 2500, daysToExpiry: 283 }] })
  items!: Array<Record<string, unknown>>;

  @ApiProperty({ description: "Sale subtotal.", example: 5000 })
  subtotal!: number;

  @ApiProperty({ description: "Requested payment method.", enum: ["cash", "card", "mobile", "insurance", "split"], example: "cash" })
  paymentMethod!: string;

  @ApiPropertyOptional({ description: "Selected customer and insurance details.", example: { name: "Aline Uwase", phone: "+250788123456", insuranceType: "cash" } })
  customer?: Record<string, unknown>;

  @ApiPropertyOptional({ description: "Acknowledges near-expiry cart lines.", example: true })
  nearExpiryAcknowledged?: boolean;

  @ApiPropertyOptional({ description: "Prescription confirmation for controlled items.", example: { confirmed: true, patientName: "Aline Uwase", prescriberName: "Dr. Mutesi" } })
  prescriptionConfirmation?: Record<string, unknown>;
}

export class PosReturnRequestDto {
  @ApiProperty({ description: "Original sale UUID.", example: "108ce7bd-0351-44bb-89df-7c953b5193f5" })
  saleId!: string;

  @ApiProperty({ description: "Branch UUID.", example: "8150740a-5ee8-4f92-8337-a72c7e390b9e" })
  branchId!: string;

  @ApiProperty({ description: "Return reason.", example: "wrong" })
  reason!: string;

  @ApiProperty({ description: "Return lines and stock dispositions.", example: [{ saleItemId: "e31f9362-0acd-4d5d-9bb3-10f5888441d5", inventoryId: "74c56b77-54bf-42a3-aab9-8bc3a80d9104", quantity: 1, disposition: "restock" }] })
  items!: Array<Record<string, unknown>>;
}

export class VoidSaleRequestDto {
  @ApiProperty({ description: "Sale UUID to void.", example: "108ce7bd-0351-44bb-89df-7c953b5193f5" })
  saleId!: string;

  @ApiPropertyOptional({ description: "Reason recorded in the sale notes.", example: "Duplicate transaction" })
  reason?: string;
}

export class InvoiceRequestDto {
  @ApiProperty({ description: "Insurance provider ID or name.", example: "RSSB" })
  insuranceType!: string;

  @ApiProperty({ description: "Invoice item lines.", example: [{ name: "Amoxicillin 500mg", price: 2500, quantity: 2 }] })
  items!: Array<Record<string, unknown>>;

  @ApiPropertyOptional({ description: "Beneficiary/customer UUID.", example: "3b5a6248-3e85-4b44-9f7f-9cd0a0da21c5" })
  patientId?: string;
}

export class PosSuccessResponseDto {
  @ApiProperty({ description: "Whether the operation succeeded.", example: true })
  success!: boolean;

  @ApiPropertyOptional({ description: "Operation-specific response payload.", example: { id: "108ce7bd-0351-44bb-89df-7c953b5193f5" } })
  result?: unknown;

  @ApiPropertyOptional({ description: "Human-readable success message.", example: "Sale processed successfully" })
  message?: string;
}

export class DailyCloseResponseDto {
  @ApiProperty({ description: "Whether the day was closed successfully.", example: true })
  success!: boolean;

  @ApiProperty({ description: "Computed daily close totals.", example: { date: "2026-07-21", totalSales: 482500, totalTransactions: 38, cashAmount: 220000 } })
  dailyClose!: Record<string, unknown>;
}
