import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ImportInventoryRowDto {
  @ApiProperty({ description: "Medication name.", example: "Cetirizine 10 mg Tablets" })
  name!: string;

  @ApiProperty({ description: "Category name or supported prefixed category ID.", example: "OTC" })
  category!: string;

  @ApiPropertyOptional({ description: "Batch number; defaults to BATCH001.", example: "CTZ-10-0726" })
  batch_number?: string;

  @ApiPropertyOptional({ description: "Opening or incremental quantity.", example: 200, minimum: 0 })
  quantity?: number;

  @ApiPropertyOptional({ description: "Acquisition cost per unit.", example: 1.15, format: "double", minimum: 0 })
  unit_cost?: number;

  @ApiPropertyOptional({ description: "Retail price per unit.", example: 2.5, format: "double", minimum: 0 })
  selling_price?: number;

  @ApiPropertyOptional({ description: "Low-stock threshold.", example: 40, minimum: 0 })
  minimum_stock_level?: number;

  @ApiPropertyOptional({ description: "Batch expiry date.", example: "2028-03-31", format: "date" })
  expiry_date?: string;
}

export class ImportInventoryDto {
  @ApiProperty({
    description: "Inventory rows to import.",
    example: [{ name: "Cetirizine 10 mg Tablets", category: "OTC", quantity: 200 }],
    type: () => ImportInventoryRowDto,
    isArray: true,
    minItems: 1,
    maxItems: 500,
  })
  rows!: ImportInventoryRowDto[];
}
