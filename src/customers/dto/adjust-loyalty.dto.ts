import { ApiProperty } from "@nestjs/swagger";

export class AdjustLoyaltyDto {
  @ApiProperty({ description: "Customer whose loyalty record will be adjusted.", example: "3b5a6248-3e85-4b44-9f7f-9cd0a0da21c5", format: "uuid" })
  customerId!: string;

  @ApiProperty({ description: "Number of points to add or subtract.", example: 50, minimum: 0 })
  points!: number;

  @ApiProperty({ description: "`add` increases points; `subtract` decreases them.", example: "add", enum: ["add", "subtract"] })
  action!: "add" | "subtract";
}
