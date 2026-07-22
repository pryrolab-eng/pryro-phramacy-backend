import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AddMedicationDto {
  @ApiProperty({ description: "Medication name used to find or create the pharmacy medication.", example: "Amoxicillin 500 mg Capsules" })
  name!: string;

  @ApiProperty({ description: "Category name, global:<uuid>, or category:<uuid>. Unknown names create a local category.", example: "Prescription Medications" })
  category!: string;

  @ApiPropertyOptional({ description: "Batch number for a newly created inventory record.", example: "AMX-500-0726" })
  batch_number?: string;

  @ApiPropertyOptional({ description: "Quantity to create or add to existing stock.", example: 120, minimum: 0 })
  quantity?: number;

  @ApiPropertyOptional({ description: "Acquisition cost per unit for new inventory.", example: 11.2, format: "double", minimum: 0 })
  unit_cost?: number;

  @ApiPropertyOptional({ description: "Retail price per unit for new inventory.", example: 18.5, format: "double", minimum: 0 })
  selling_price?: number;

  @ApiPropertyOptional({ description: "Low-stock threshold for new inventory.", example: 25, minimum: 0 })
  minimum_stock_level?: number;

  @ApiPropertyOptional({ description: "Expiry date for a newly created batch.", example: "2027-11-30", format: "date" })
  expiry_date?: string;

  @ApiPropertyOptional({ description: "Preferred stock location ID.", example: "8c2537f8-8773-4fe7-98c4-52d1836782fc", format: "uuid" })
  stock_location_id?: string;

  @ApiPropertyOptional({ description: "Stock location ID or name alias.", example: "Dispensary Shelf A3" })
  stockLocation?: string;

  @ApiPropertyOptional({ description: "Snake-case stock location ID or name alias.", example: "Dispensary Shelf A3" })
  stock_location?: string;
}
