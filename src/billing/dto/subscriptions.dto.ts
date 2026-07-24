import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class PlanLimitsDto {
  @ApiProperty() limits!: Record<string, unknown>;
  @ApiProperty() usage!: Record<string, unknown>;
  @ApiProperty() canAddUser!: boolean;
}

export class SubscriptionUpgradeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  planId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentTransactionId?: string;
}

export class UpgradeResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty() subscription!: Record<string, unknown>;
}

export class ScheduleDowngradeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  target_plan_id!: string;
}

export class BranchAddonDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  planId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  branch?: { name?: string; address?: string; phone?: string; email?: string };
}

export class CancelSubscriptionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subscription_id!: string;
}
