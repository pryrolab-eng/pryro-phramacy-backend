import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class PurchaseInventoryDto {
  @ApiProperty({ description: "Inventory record receiving the purchase.", example: "3c0c6751-0fc2-48db-8ad6-b9d2fb4517ba", format: "uuid" })
  productId!: string;

  @ApiProperty({ description: "Quantity received and added to current stock.", example: 48, minimum: 0 })
  quantity!: number;

  @ApiPropertyOptional({ description: "Optional replacement acquisition cost per unit.", example: 10.95, format: "double", minimum: 0 })
  costPrice?: number;
}
