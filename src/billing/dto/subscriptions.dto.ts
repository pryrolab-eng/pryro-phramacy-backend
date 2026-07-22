import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class PlanLimitsDto {
  @ApiProperty() limits!: Record<string, unknown>;
  @ApiProperty() usage!: Record<string, unknown>;
  @ApiProperty() canAddUser!: boolean;
}

export class SubscriptionUpgradeDto {
  @ApiProperty() planId!: string;
  @ApiPropertyOptional() paymentTransactionId?: string;
}

export class UpgradeResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty() subscription!: Record<string, unknown>;
}

export class ScheduleDowngradeDto {
  @ApiProperty() target_plan_id!: string;
}

export class BranchAddonDto {
  @ApiProperty() planId!: string;
  @ApiPropertyOptional() branchId?: string;
  @ApiPropertyOptional() branch?: { name?: string; address?: string; phone?: string; email?: string };
}

export class CancelSubscriptionDto {
  @ApiProperty() subscription_id!: string;
}
