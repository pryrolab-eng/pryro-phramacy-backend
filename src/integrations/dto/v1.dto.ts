import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsIn, IsNumber, IsObject, IsOptional, IsString, IsUrl, Max, Min } from "class-validator";

// --- Responses ---

export class HealthResponseDto {
  @ApiProperty() ok!: boolean;
  @ApiProperty() service!: string;
  @ApiProperty() version!: string;
  @ApiProperty() keyName!: string;
}

class DiscoveryEndpointDto {
  @ApiProperty() method!: string;
  @ApiProperty() path!: string;
  @ApiProperty({ nullable: true }) permission!: string | null;
  @ApiProperty() description!: string;
}

export class DiscoveryResponseDto {
  @ApiProperty() version!: string;
  @ApiProperty() auth!: Record<string, unknown>;
  @ApiProperty({ type: [DiscoveryEndpointDto] }) endpoints!: DiscoveryEndpointDto[];
  @ApiProperty() key!: { name: string; permissions: string[] };
}

export class IntegrationPharmacySummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiProperty({ nullable: true }) city!: string | null;
  @ApiProperty({ nullable: true }) province!: string | null;
  @ApiProperty({ nullable: true }) status!: string | null;
  @ApiProperty({ nullable: true }) subscriptionPlan!: string | null;
  @ApiProperty({ nullable: true }) createdAt!: string | null;
}

class IntegrationBranchDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) address!: string | null;
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiProperty() isActive!: boolean;
}

export class IntegrationPharmacyDetailDto extends IntegrationPharmacySummaryDto {
  @ApiProperty({ nullable: true }) address!: string | null;
  @ApiProperty({ nullable: true }) licenseNumber!: string | null;
  @ApiProperty({ type: [IntegrationBranchDto] }) branches!: IntegrationBranchDto[];
}

export class IntegrationInventoryItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() medicationId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() category!: string;
  @ApiProperty() stock!: number;
  @ApiProperty() minStock!: number;
  @ApiProperty() price!: number;
  @ApiProperty() expiryDate!: string | null;
  @ApiProperty() batchNumber!: string | null;
}

export class IntegrationSalesItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) receiptNumber!: string | null;
  @ApiProperty({ nullable: true }) customerName!: string | null;
  @ApiProperty({ nullable: true }) customerPhone!: string | null;
  @ApiProperty() totalAmount!: number;
  @ApiProperty({ nullable: true }) paymentMethod!: string | null;
  @ApiProperty({ nullable: true }) status!: string | null;
  @ApiProperty({ nullable: true }) branchId!: string | null;
  @ApiProperty() itemCount!: number;
  @ApiProperty({ nullable: true }) createdAt!: string | null;
}

export class IntegrationWebhookDto {
  @ApiProperty() id!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ type: [String] }) events!: string[];
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class CreateWebhookDto {
  @ApiProperty() @IsString() url!: string;
  @ApiProperty({ type: [String] }) @IsArray() events!: string[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() secret?: string;
}

export class CreateWebhookResponseDto {
  @ApiProperty({ type: IntegrationWebhookDto }) webhook!: IntegrationWebhookDto;
}

export class IntegrationPharmacyListResponseDto {
  @ApiProperty({ type: [IntegrationPharmacySummaryDto] }) pharmacies!: IntegrationPharmacySummaryDto[];
  @ApiProperty() count!: number;
}

export class IntegrationPharmacyDetailResponseDto {
  @ApiProperty({ type: IntegrationPharmacyDetailDto }) pharmacy!: IntegrationPharmacyDetailDto;
}

export class IntegrationInventoryResponseDto {
  @ApiProperty() pharmacyId!: string;
  @ApiProperty({ nullable: true }) branchId!: string | null;
  @ApiProperty({ type: [IntegrationInventoryItemDto] }) inventory!: IntegrationInventoryItemDto[];
  @ApiProperty() count!: number;
}

export class IntegrationSalesResponseDto {
  @ApiProperty() pharmacyId!: string;
  @ApiProperty({ nullable: true }) from!: string | null;
  @ApiProperty({ nullable: true }) to!: string | null;
  @ApiProperty({ type: [IntegrationSalesItemDto] }) sales!: IntegrationSalesItemDto[];
  @ApiProperty() count!: number;
}

export class IntegrationWebhookListResponseDto {
  @ApiProperty({ type: [IntegrationWebhookDto] }) webhooks!: IntegrationWebhookDto[];
  @ApiProperty() count!: number;
}

export class IntegrationDeleteWebhookResponseDto {
  @ApiProperty() success!: boolean;
}

// --- V1 Permission constants ---

export const INTEGRATION_V1_PERMISSIONS = {
  pharmaciesRead: "pharmacies.read",
  inventoryRead: "inventory.read",
  salesRead: "sales.read",
  webhooksManage: "webhooks.manage",
  all: "*",
} as const;

export type IntegrationV1Permission = (typeof INTEGRATION_V1_PERMISSIONS)[keyof typeof INTEGRATION_V1_PERMISSIONS];
