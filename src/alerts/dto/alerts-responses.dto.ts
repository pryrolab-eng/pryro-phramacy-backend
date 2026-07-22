import { ApiProperty } from "@nestjs/swagger";

export class DashboardAlertDto {
  @ApiProperty({ description: "Inventory row identifier.", example: "28ee8cbb-9bd7-4ec8-b860-bae5909ca0d7", format: "uuid" })
  id!: string;
  @ApiProperty({ description: "Medication name.", example: "Amoxicillin 500 mg" })
  product!: string;
  @ApiProperty({ description: "Current quantity in stock.", example: 8 })
  current_stock!: number;
  @ApiProperty({ description: "Configured minimum stock level.", example: 20 })
  min_stock!: number;
  @ApiProperty({ description: "Medication category.", example: "Antibiotics" })
  category!: string;
  @ApiProperty({ description: "Whole days until expiry, or zero.", example: 20 })
  expires_in!: number;
}

export class StockAlertItemDto {
  @ApiProperty({ description: "Inventory row identifier.", example: "28ee8cbb-9bd7-4ec8-b860-bae5909ca0d7", format: "uuid" })
  id!: string;
  @ApiProperty({ description: "Medication name.", example: "Amoxicillin 500 mg" })
  name!: string;
  @ApiProperty({ description: "Medication category.", example: "Antibiotics" })
  category!: string;
  @ApiProperty({ description: "Supplier batch number.", example: "AMX-2606-14", nullable: true })
  batch!: string | null;
  @ApiProperty({ description: "Current quantity in stock.", example: 8, nullable: true })
  quantity!: number | null;
  @ApiProperty({ description: "Configured minimum stock level.", example: 20, nullable: true })
  minimum!: number | null;
  @ApiProperty({ description: "Batch expiry date.", example: "2026-08-10", format: "date", nullable: true })
  expiry!: string | null;
}

export class StockAlertsResponseDto {
  @ApiProperty({ description: "All matching inventory rows.", type: StockAlertItemDto, isArray: true })
  all!: StockAlertItemDto[];
  @ApiProperty({ description: "Rows at or below their minimum level.", type: StockAlertItemDto, isArray: true })
  lowStock!: StockAlertItemDto[];
  @ApiProperty({ description: "Rows expiring within 30 days.", type: StockAlertItemDto, isArray: true })
  expiring!: StockAlertItemDto[];
}
