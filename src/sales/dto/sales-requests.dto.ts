import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateSaleDetailsDto {
  @ApiPropertyOptional({
    description: "Customer display name. Missing or empty values become `Walk-in Customer`.",
    example: "Aline Uwase",
  })
  customer_name?: string;

  @ApiProperty({ description: "Sale subtotal before insurance.", example: 15000 })
  subtotal!: number;

  @ApiPropertyOptional({ description: "Amount covered by insurance. Missing or zero-like values become zero.", example: 5000 })
  insurance_amount?: number;

  @ApiProperty({ description: "Amount paid by the customer.", example: 10000 })
  customer_amount!: number;

  @ApiProperty({ description: "Final sale total.", example: 15000 })
  total_amount!: number;

  @ApiProperty({
    description: "Payment method stored for the sale.",
    example: "cash",
    enum: ["cash", "card", "mobile_money", "insurance", "mixed"],
  })
  payment_method!: string;

  @ApiProperty({
    description: "Initial sale status.",
    example: "completed",
    enum: ["completed", "pending", "cancelled", "refunded"],
  })
  status!: string;
}

export class CreateSaleItemDto {
  @ApiProperty({ description: "Inventory record sold.", example: "3c0c6751-0fc2-48db-8ad6-b9d2fb4517ba", format: "uuid" })
  inventory_id!: string;

  @ApiProperty({ description: "Medication name copied onto the sale item.", example: "Amoxicillin 500 mg" })
  medication_name!: string;

  @ApiProperty({ description: "Units sold.", example: 2 })
  quantity!: number;

  @ApiProperty({ description: "Price for one unit.", example: 7500 })
  unit_price!: number;

  @ApiProperty({ description: "Total line price.", example: 15000 })
  total_price!: number;
}

export class CreateSaleDto {
  @ApiProperty({ description: "Sale header values.", type: CreateSaleDetailsDto })
  sale!: CreateSaleDetailsDto;

  @ApiPropertyOptional({
    description: "Sale lines. Each line is inserted and then deducted from inventory.",
    type: [CreateSaleItemDto],
  })
  items?: CreateSaleItemDto[];
}
