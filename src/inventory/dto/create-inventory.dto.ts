import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateInventoryDto {
  @ApiProperty({ description: "ID of the existing medication to stock.", example: "21f777ae-e1b4-4a66-b193-72d89f922f49", format: "uuid" })
  medication_id!: string;

  @ApiPropertyOptional({ description: "Batch number; defaults to BATCH001.", example: "AMX-500-0726" })
  batch_number?: string;

  @ApiProperty({ description: "Opening quantity for the batch.", example: 120, minimum: 0 })
  quantity!: number;

  @ApiPropertyOptional({ description: "Acquisition cost per unit; defaults to zero.", example: 11.2, format: "double", minimum: 0 })
  unit_cost?: number;

  @ApiPropertyOptional({ description: "Retail price per unit; defaults to zero.", example: 18.5, format: "double", minimum: 0 })
  selling_price?: number;

  @ApiPropertyOptional({ description: "Quantity at which the batch is considered low stock.", example: 25, minimum: 0 })
  minimum_stock_level?: number;

  @ApiPropertyOptional({ description: "Batch expiry date; the service applies its legacy default when omitted.", example: "2027-11-30", format: "date" })
  expiry_date?: string;

  @ApiPropertyOptional({ description: "Stock location UUID or location name.", example: "Dispensary Shelf A3" })
  stockLocation?: string;

  @ApiPropertyOptional({ description: "Snake-case alias for stockLocation.", example: "Dispensary Shelf A3" })
  stock_location?: string;

  @ApiPropertyOptional({ description: "UUID alias for selecting a stock location.", example: "8c2537f8-8773-4fe7-98c4-52d1836782fc", format: "uuid" })
  stock_location_id?: string;
}
