import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class StockLocationDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiProperty() pharmacy_id!: string | null;
  @ApiPropertyOptional() is_active?: boolean | null;
  @ApiPropertyOptional() created_at?: Date | null;
}

export class CreateLocationDto {
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
}
