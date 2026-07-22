import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class PlanDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() price!: number;
  @ApiProperty() period!: string;
  @ApiProperty({ type: [String] }) features!: string[];
  @ApiProperty() is_popular!: boolean;
  @ApiProperty() is_active!: boolean;
  @ApiPropertyOptional() plan_type?: string;
  @ApiPropertyOptional() monthly_tx_limit?: number | null;
  @ApiPropertyOptional() max_users?: number | null;
  @ApiPropertyOptional() max_branches?: number | null;
}

export class PlansListResponseDto {
  @ApiProperty({ type: [PlanDto] })
  plans!: PlanDto[];
}
