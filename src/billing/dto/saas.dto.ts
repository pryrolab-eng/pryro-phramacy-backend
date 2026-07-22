import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class SaasCreatePlanDto {
  @ApiProperty() name!: string;
  @ApiProperty() price!: number;
  @ApiProperty() billing_period!: string;
  @ApiProperty() plan_type!: string;
  @ApiPropertyOptional() max_branches?: number;
  @ApiPropertyOptional() max_users?: number;
  @ApiPropertyOptional() monthly_tx_limit?: number;
  @ApiPropertyOptional({ type: [String] }) features?: string[];
  @ApiPropertyOptional() is_popular?: boolean;
  @ApiPropertyOptional({ type: [String] }) featureKeys?: string[];
}

export class UpdatePlanDto {
  name?: string;
  price?: number;
  billing_period?: string;
  plan_type?: string;
  max_branches?: number;
  max_users?: number;
  monthly_tx_limit?: number;
  features?: string[];
  is_popular?: boolean;
  is_active?: boolean;
  featureKeys?: string[];
}

export class SubscribeDto {
  @ApiProperty() plan_id!: string;
  @ApiPropertyOptional() subscription_type?: string;
  @ApiPropertyOptional() branch_id?: string;
}

export class CancelSaaSSubscriptionDto {
  @ApiProperty() subscription_id!: string;
}

export class GenerateInvoiceDto {
  @ApiProperty() month!: string;
}

export class CreateBranchDto {
  @ApiProperty() name!: string;
  @ApiPropertyOptional() address?: string;
  @ApiPropertyOptional() phone?: string;
  @ApiPropertyOptional() email?: string;
}

export class CheckUsageDto {
  @ApiProperty() branch_id!: string;
}

export class IncrementUsageDto {
  @ApiProperty() branch_id!: string;
}
