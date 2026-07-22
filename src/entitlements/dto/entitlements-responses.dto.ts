import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class EntitlementPlanDto {
  @ApiProperty({ description: "Plan identifier.", example: "bfc13f34-e2a6-463a-8ecf-21404608f168", format: "uuid" }) id!: string;
  @ApiProperty({ description: "Plan name.", example: "Growth" }) name!: string;
  @ApiProperty({ description: "Plan price.", example: 75000, format: "double" }) price!: number;
  @ApiProperty({ description: "Billing period.", example: "monthly", nullable: true }) period!: string | null;
  @ApiPropertyOptional({ description: "Configured user limit.", example: 15 }) max_users?: number;
  @ApiPropertyOptional({ description: "Configured base branch limit.", example: 3 }) max_branches?: number;
  @ApiPropertyOptional({ description: "Monthly transaction limit per branch.", example: 5000 }) monthly_tx_limit?: number;
}
export class EntitlementLimitsDto {
  @ApiProperty({ description: "Maximum active users.", example: 15 }) maxUsers!: number;
  @ApiProperty({ description: "Base maximum branches.", example: 3 }) maxBranches!: number;
  @ApiProperty({ description: "Monthly transaction limit per branch.", example: 5000 }) monthlyTxPerBranch!: number;
  @ApiProperty({ description: "Base branch slots plus active add-ons.", example: 4 }) totalBranchSlots!: number;
}
export class EntitlementUsageDto {
  @ApiProperty({ description: "Current active user count.", example: 7 }) activeUsers!: number;
  @ApiProperty({ description: "Current active branch count.", example: 2 }) activeBranches!: number;
}
export class EntitlementsResponseDto {
  @ApiProperty({ description: "Active pharmacy identifier; empty for platform administrators.", example: "ef829450-3a46-4553-a319-253b194e9b2e" }) pharmacyId!: string;
  @ApiProperty({ description: "Normalized pharmacy status.", example: "active" }) pharmacyStatus!: string;
  @ApiProperty({ description: "Effective subscription plan.", type: EntitlementPlanDto, nullable: true }) effectivePlan!: EntitlementPlanDto | null;
  @ApiProperty({ description: "Lowercase effective plan label.", example: "growth" }) effectivePlanLabel!: string;
  @ApiProperty({ description: "Whether pharmacy access is allowed.", example: true }) isAccessAllowed!: boolean;
  @ApiProperty({ description: "Reason access is blocked, or none.", example: "none", enum: ["none", "pharmacy_suspended", "pharmacy_inactive", "pending_payment", "subscription_expired", "subscription_cancelled", "past_due", "no_subscription"] }) accessBlockReason!: string;
  @ApiProperty({ description: "Whether the subscription has expired.", example: false }) isExpired!: boolean;
  @ApiProperty({ description: "Whole days until expiry.", example: 18, nullable: true }) daysRemaining!: number | null;
  @ApiProperty({ description: "Enabled boolean feature keys.", example: ["inventory", "reports"], isArray: true }) featureKeys!: string[];
  @ApiProperty({ description: "Effective plan limits.", type: EntitlementLimitsDto }) limits!: EntitlementLimitsDto;
  @ApiProperty({ description: "Current resource usage.", type: EntitlementUsageDto }) usage!: EntitlementUsageDto;
  @ApiProperty({ description: "Application route to feature-key mapping.", example: { "/inventory": "inventory" }, type: "object", additionalProperties: { type: "string" } }) routeFeatureMap!: Record<string, string>;
  @ApiProperty({ description: "Feature-key to display-label mapping.", example: { inventory: "Inventory" }, type: "object", additionalProperties: { type: "string" } }) featureLabels!: Record<string, string>;
}
