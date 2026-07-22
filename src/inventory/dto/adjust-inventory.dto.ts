import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AdjustInventoryDto {
  @ApiProperty({ description: "Inventory record to adjust.", example: "3c0c6751-0fc2-48db-8ad6-b9d2fb4517ba", format: "uuid" })
  productId!: string;

  @ApiPropertyOptional({ description: "Adjustment direction; values other than increase are treated as decrease.", example: "decrease", enum: ["increase", "decrease"] })
  adjustmentType?: "increase" | "decrease";

  @ApiProperty({ description: "Number of units to add or remove.", example: 6, minimum: 0 })
  quantity!: number;

  @ApiPropertyOptional({ description: "Optional audit explanation.", example: "Damaged blister packs removed during cycle count" })
  reason?: string;
}
