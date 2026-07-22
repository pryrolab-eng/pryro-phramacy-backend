import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

const INVENTORY_ID = "3c0c6751-0fc2-48db-8ad6-b9d2fb4517ba";
const MEDICATION_ID = "21f777ae-e1b4-4a66-b193-72d89f922f49";
const PHARMACY_ID = "37f5f20e-8d92-4d9c-b75e-f13e530bfa61";

export class InventoryMedicationDto {
  @ApiProperty({ description: "Medication name.", example: "Amoxicillin 500 mg Capsules" })
  name!: string;

  @ApiProperty({ description: "Resolved category name.", example: "Prescription" })
  category!: string;

  @ApiProperty({ description: "Owning pharmacy ID.", example: PHARMACY_ID, format: "uuid", nullable: true })
  pharmacy_id!: string | null;
}

export class InventoryListItemDto {
  @ApiProperty({ description: "Inventory record ID.", example: INVENTORY_ID, format: "uuid" })
  id!: string;

  @ApiProperty({ description: "Medication ID.", example: MEDICATION_ID, format: "uuid" })
  medicationId!: string;

  @ApiProperty({ description: "Medication display name.", example: "Amoxicillin 500 mg Capsules" })
  name!: string;

  @ApiProperty({ description: "Resolved medication category name.", example: "Prescription" })
  category!: string;

  @ApiProperty({ description: "Current quantity in stock.", example: 120, nullable: true })
  stock!: number | null;

  @ApiProperty({ description: "Low-stock threshold.", example: 25, nullable: true })
  minStock!: number | null;

  @ApiProperty({ description: "Selling price.", example: 18.5, format: "double", nullable: true })
  price!: number | null;

  @ApiProperty({ description: "Batch expiry date.", example: "2027-11-30", format: "date", nullable: true })
  expiryDate!: string | null;

  @ApiProperty({ description: "Manufacturer or pharmacy batch number.", example: "AMX-500-0726" })
  batchNumber!: string;

  @ApiProperty({ description: "Assigned stock location ID.", example: "8c2537f8-8773-4fe7-98c4-52d1836782fc", format: "uuid", nullable: true })
  stockLocationId!: string | null;

  @ApiProperty({ description: "Assigned stock location name.", example: "Dispensary Shelf A3", nullable: true })
  stockLocationName!: string | null;

  @ApiProperty({ description: "Medication details joined to this inventory record.", type: () => InventoryMedicationDto, nullable: true, example: { name: "Amoxicillin 500 mg Capsules", category: "Prescription", pharmacy_id: PHARMACY_ID } })
  medications!: InventoryMedicationDto | null;

  @ApiProperty({ description: "Owning pharmacy ID.", example: PHARMACY_ID, format: "uuid", nullable: true })
  pharmacy_id!: string | null;
}

export class RawInventoryDto {
  @ApiProperty({ description: "Inventory record ID.", example: INVENTORY_ID, format: "uuid" })
  id!: string;

  @ApiProperty({ description: "Pharmacy ID.", example: PHARMACY_ID, format: "uuid", nullable: true })
  pharmacy_id!: string | null;

  @ApiProperty({ description: "Medication ID.", example: MEDICATION_ID, format: "uuid", nullable: true })
  medication_id!: string | null;

  @ApiProperty({ description: "Supplier ID.", example: null, format: "uuid", nullable: true })
  supplier_id!: string | null;

  @ApiProperty({ description: "Batch number.", example: "AMX-500-0726" })
  batch_number!: string;

  @ApiProperty({ description: "Current stock quantity.", example: 120, nullable: true })
  quantity_in_stock!: number | null;

  @ApiProperty({ description: "Unit acquisition cost serialized from a decimal value.", example: "11.20", nullable: true })
  unit_cost!: string | number | null;

  @ApiProperty({ description: "Unit selling price serialized from a decimal value.", example: "18.50", nullable: true })
  selling_price!: string | number | null;

  @ApiProperty({ description: "Low-stock threshold.", example: 25, nullable: true })
  minimum_stock_level!: number | null;

  @ApiProperty({ description: "Batch expiry timestamp.", example: "2027-11-30T00:00:00.000Z", format: "date-time", nullable: true })
  expiry_date!: string | null;

  @ApiProperty({ description: "Manufacturing timestamp.", example: null, format: "date-time", nullable: true })
  manufacturing_date!: string | null;

  @ApiProperty({ description: "Stock receipt timestamp.", example: "2026-07-21T10:15:00.000Z", format: "date-time", nullable: true })
  received_date!: string | null;

  @ApiProperty({ description: "Creation timestamp.", example: "2026-07-21T10:15:00.000Z", format: "date-time", nullable: true })
  created_at!: string | null;

  @ApiProperty({ description: "Last update timestamp.", example: "2026-07-21T10:15:00.000Z", format: "date-time", nullable: true })
  updated_at!: string | null;

  @ApiProperty({ description: "Branch ID.", example: "94e4fb51-76c9-45eb-8597-22f0898c72ec", format: "uuid", nullable: true })
  branch_id!: string | null;

  @ApiProperty({ description: "Stock location ID.", example: "8c2537f8-8773-4fe7-98c4-52d1836782fc", format: "uuid", nullable: true })
  stock_location_id!: string | null;
}

export class AlertItemDto {
  @ApiProperty({ description: "Inventory record ID.", example: INVENTORY_ID, format: "uuid" })
  id!: string;
  @ApiProperty({ description: "Medication name.", example: "Amoxicillin 500 mg Capsules" })
  name!: string;
  @ApiProperty({ description: "Resolved category name.", example: "Prescription" })
  category!: string;
  @ApiProperty({ description: "Batch number.", example: "AMX-500-0726" })
  batch!: string;
  @ApiProperty({ description: "Current quantity.", example: 12, nullable: true })
  quantity!: number | null;
  @ApiProperty({ description: "Low-stock threshold.", example: 25, nullable: true })
  minimum!: number | null;
  @ApiProperty({ description: "Expiry date.", example: "2026-08-12", format: "date", nullable: true })
  expiry!: string | null;
}

export class ExpiryAlertDto {
  @ApiProperty({ description: "Inventory record ID.", example: INVENTORY_ID, format: "uuid" })
  id!: string;
  @ApiProperty({ description: "Medication name.", example: "Amoxicillin 500 mg Capsules" })
  product!: string;
  @ApiProperty({ description: "Batch number.", example: "AMX-500-0726" })
  batchNumber!: string;
  @ApiProperty({ description: "Expiry date.", example: "2026-08-12", format: "date" })
  expiryDate!: string;
  @ApiProperty({ description: "Calendar days until expiry; negative values indicate expired stock.", example: 22 })
  daysUntilExpiry!: number;
  @ApiProperty({ description: "Units in the batch.", example: 12 })
  quantity!: number;
  @ApiProperty({ description: "Alert priority derived from days until expiry.", example: "high", enum: ["high", "medium", "low"] })
  priority!: "high" | "medium" | "low";
}

export class SupplierDto {
  @ApiProperty({ description: "Supplier ID.", example: "ba2bf838-208b-49f6-a54d-f62da8a39fc1", format: "uuid" })
  id!: string;
  @ApiProperty({ description: "Pharmacy ID.", example: PHARMACY_ID, format: "uuid", nullable: true })
  pharmacy_id!: string | null;
  @ApiProperty({ description: "Supplier business name.", example: "MediSource Wholesale Ltd" })
  name!: string;
  @ApiProperty({ description: "Primary supplier contact.", example: "Amina Yusuf", nullable: true })
  contact_person!: string | null;
  @ApiProperty({ description: "Contact email.", example: "orders@medisource.example", format: "email", nullable: true })
  email!: string | null;
  @ApiProperty({ description: "Contact phone number.", example: "+234 803 555 0142", nullable: true })
  phone!: string | null;
  @ApiProperty({ description: "Supplier postal address.", example: "12 Market Road", nullable: true })
  address!: string | null;
  @ApiProperty({ description: "Whether the supplier is active.", example: true, nullable: true })
  is_active!: boolean | null;
  @ApiProperty({ description: "Creation timestamp.", example: "2026-07-21T10:15:00.000Z", format: "date-time", nullable: true })
  created_at!: string | null;
  @ApiProperty({ description: "Last update timestamp.", example: "2026-07-21T10:15:00.000Z", format: "date-time", nullable: true })
  updated_at!: string | null;
}

export class TransferDto {
  @ApiProperty({ description: "Transfer ID.", example: "12f7980e-e36c-43dd-a8c4-a1702f364503", format: "uuid" })
  id!: string;
  @ApiProperty({ description: "Medication name.", example: "Amoxicillin 500 mg Capsules" })
  product!: string;
  @ApiProperty({ description: "Units transferred.", example: 24 })
  quantity!: number;
  @ApiProperty({ description: "Source branch ID.", example: "94e4fb51-76c9-45eb-8597-22f0898c72ec", format: "uuid", nullable: true })
  from!: string | null;
  @ApiProperty({ description: "Destination branch ID.", example: "f79e32e1-aa15-4495-9fc7-a77dcbf07e78", format: "uuid", nullable: true })
  to!: string | null;
  @ApiProperty({ description: "Transfer status.", example: "completed", nullable: true })
  status!: string | null;
  @ApiProperty({ description: "Transfer creation timestamp.", example: "2026-07-21T10:15:00.000Z", format: "date-time", nullable: true })
  date!: string | null;
}

export class StockByCategoryDto {
  @ApiProperty({ description: "Category name.", example: "Prescription" })
  category!: string;
  @ApiProperty({ description: "Total units in the category.", example: 245 })
  stock!: number;
  @ApiProperty({ description: "Rounded retail inventory value.", example: 4533 })
  value!: number;
}

export class InventoryTrendDto {
  @ApiProperty({ description: "Abbreviated calendar month.", example: "Jul", enum: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] })
  month!: string;
  @ApiProperty({ description: "Rounded estimated inventory value.", example: 4533 })
  value!: number;
}

export class InventoryAnalyticsDto {
  @ApiProperty({ description: "Current stock and rounded inventory value grouped by category.", type: () => StockByCategoryDto, isArray: true, example: [{ category: "Prescription", stock: 245, value: 4533 }] })
  stockByCategory!: StockByCategoryDto[];
  @ApiProperty({ description: "Synthetic monthly inventory value trend through the current month.", type: () => InventoryTrendDto, isArray: true, example: [{ month: "Jul", value: 4533 }] })
  inventoryTrend!: InventoryTrendDto[];
}

export class StockAlertsDto {
  @ApiProperty({ description: "All inventory alert rows.", type: () => AlertItemDto, isArray: true })
  all!: AlertItemDto[];
  @ApiProperty({ description: "Rows at or below their low-stock threshold.", type: () => AlertItemDto, isArray: true })
  lowStock!: AlertItemDto[];
  @ApiProperty({ description: "Rows expiring within thirty days.", type: () => AlertItemDto, isArray: true })
  expiring!: AlertItemDto[];
}

export class CombinedInventoryDto {
  @ApiProperty({ description: "Branch-scoped inventory records.", type: () => InventoryListItemDto, isArray: true })
  inventory!: InventoryListItemDto[];
  @ApiProperty({ description: "Grouped stock and expiry alerts.", type: () => StockAlertsDto })
  stockAlerts!: StockAlertsDto;
  @ApiProperty({ description: "Pharmacy-wide expiry alerts.", type: () => ExpiryAlertDto, isArray: true })
  expiryAlerts!: ExpiryAlertDto[];
}

import { SuccessResponseDto } from "../../common/dto";

export class InventoryCreatedResponseDto extends SuccessResponseDto {
  @ApiProperty({ description: "Created inventory record.", type: () => RawInventoryDto })
  inventory!: RawInventoryDto;
}

export class MedicationAddedResponseDto extends InventoryCreatedResponseDto {
  @ApiPropertyOptional({ description: "Present when an existing inventory quantity was incremented.", example: "Quantity updated" })
  message?: string;
  @ApiProperty({ description: "Medication ID.", example: MEDICATION_ID, format: "uuid" })
  medicationId!: string;
}

export class StockChangedResponseDto extends SuccessResponseDto {
  @ApiProperty({ description: "Quantity after the stock operation.", example: 114 })
  newStock!: number;
}

export class SupplierCreatedResponseDto extends SuccessResponseDto {
  @ApiProperty({ description: "Created supplier.", type: () => SupplierDto })
  supplier!: SupplierDto;
}

export class TransferCreatedResponseDto extends StockChangedResponseDto {
  @ApiProperty({ description: "Resulting destination-branch quantity.", example: 54 })
  destinationStock!: number;
  @ApiProperty({ description: "Created transfer record ID.", example: "12f7980e-e36c-43dd-a8c4-a1702f364503", format: "uuid" })
  transferId!: string;
}

export class ImportFailureDto {
  @ApiProperty({ description: "Spreadsheet-style row number, including the header row.", example: 2 })
  rowNumber!: number;
  @ApiProperty({ description: "Medication name or fallback label.", example: "Cetirizine 10 mg Tablets" })
  label!: string;
  @ApiProperty({ description: "Reason this row failed.", example: "Category is required" })
  error!: string;
}

export class ImportInventoryResponseDto extends SuccessResponseDto {
  @ApiProperty({ description: "Number of submitted rows.", example: 1 })
  attempted!: number;
  @ApiProperty({ description: "Number of imported rows.", example: 1 })
  succeeded!: number;
  @ApiProperty({ description: "Rows that could not be imported.", type: () => ImportFailureDto, isArray: true, example: [] })
  failures!: ImportFailureDto[];
}
