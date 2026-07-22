import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateInventoryDto {
  @ApiPropertyOptional({ description: "Replacement quantity in stock.", example: 145, minimum: 0 })
  quantity?: number;

  @ApiPropertyOptional({ description: "Replacement retail price per unit.", example: 19.25, format: "double", minimum: 0 })
  selling_price?: number;

  @ApiPropertyOptional({ description: "Replacement low-stock threshold.", example: 30, minimum: 0 })
  minimum_stock_level?: number;
}
