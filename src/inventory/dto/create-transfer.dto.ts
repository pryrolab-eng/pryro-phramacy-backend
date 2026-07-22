import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateTransferDto {
  @ApiPropertyOptional({ description: "Source inventory record ID.", example: "3c0c6751-0fc2-48db-8ad6-b9d2fb4517ba", format: "uuid" })
  productId?: string;

  @ApiPropertyOptional({ description: "Legacy alias for productId.", example: "3c0c6751-0fc2-48db-8ad6-b9d2fb4517ba", format: "uuid" })
  inventoryId?: string;

  @ApiPropertyOptional({ description: "Source branch ID.", example: "94e4fb51-76c9-45eb-8597-22f0898c72ec", format: "uuid" })
  fromBranchId?: string;

  @ApiPropertyOptional({ description: "Legacy alias for fromBranchId.", example: "94e4fb51-76c9-45eb-8597-22f0898c72ec", format: "uuid" })
  from?: string;

  @ApiPropertyOptional({ description: "Destination branch ID.", example: "f79e32e1-aa15-4495-9fc7-a77dcbf07e78", format: "uuid" })
  toBranchId?: string;

  @ApiPropertyOptional({ description: "Legacy alias for toBranchId.", example: "f79e32e1-aa15-4495-9fc7-a77dcbf07e78", format: "uuid" })
  to?: string;

  @ApiProperty({ description: "Whole number of units to transfer.", example: 24, minimum: 1 })
  quantity!: number;
}
