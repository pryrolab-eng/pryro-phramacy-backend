import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AdminCreatePharmacyDto {
  @ApiProperty() owner_email!: string;
  @ApiProperty() owner_password!: string;
  @ApiPropertyOptional() owner_name?: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() address?: string;
  @ApiPropertyOptional() phone?: string;
  @ApiPropertyOptional() email?: string;
  @ApiPropertyOptional() license_number?: string;
  @ApiPropertyOptional() subscription_plan?: string;
}

export class UpdatePharmacyDto {
  @ApiPropertyOptional() name?: string;
  @ApiPropertyOptional() address?: string;
  @ApiPropertyOptional() phone?: string;
  @ApiPropertyOptional() email?: string;
  @ApiPropertyOptional() license_number?: string;
  @ApiPropertyOptional() subscription_plan?: string;
  @ApiPropertyOptional() status?: string;
  @ApiPropertyOptional() new_password?: string;
  @ApiPropertyOptional() owner_email?: string;
  @ApiPropertyOptional() owner_name?: string;
}

export class BrandingUpdateDto {
  @ApiPropertyOptional() primary_color?: string;
  @ApiPropertyOptional() secondary_color?: string;
  @ApiPropertyOptional() logo_url?: string;
  @ApiPropertyOptional() favicon_url?: string;
  @ApiPropertyOptional() pharmacy_name?: string;
  [key: string]: unknown;
}

export class AdminCreatePlanDto {
  @ApiProperty() name!: string;
  @ApiPropertyOptional() price?: number;
  @ApiPropertyOptional() plan_type?: string;
  @ApiPropertyOptional() billing_cadence?: string;
  @ApiPropertyOptional() billing_period?: string;
  @ApiPropertyOptional() features?: string[];
  @ApiPropertyOptional() feature_keys?: string[];
  @ApiPropertyOptional() featureKeys?: string[];
  @ApiPropertyOptional() is_popular?: boolean;
  @ApiPropertyOptional() max_branches?: number;
  @ApiPropertyOptional() max_users?: number;
  @ApiPropertyOptional() monthly_tx_limit?: number;
}

export class UpdatePlanDto {
  @ApiPropertyOptional() name?: string;
  @ApiPropertyOptional() price?: number;
  @ApiPropertyOptional() billing_cadence?: string;
  @ApiPropertyOptional() billing_period?: string;
  @ApiPropertyOptional() features?: string[];
  @ApiPropertyOptional() feature_keys?: string[];
  @ApiPropertyOptional() featureKeys?: string[];
  @ApiPropertyOptional() is_popular?: boolean;
  @ApiPropertyOptional() is_active?: boolean;
  @ApiPropertyOptional() plan_type?: string;
  @ApiPropertyOptional() max_branches?: number;
  @ApiPropertyOptional() max_users?: number;
  @ApiPropertyOptional() monthly_tx_limit?: number;
}

export class CancelPendingBillingDto {
  @ApiPropertyOptional() payment_transaction_id?: string;
  @ApiPropertyOptional() subscription_id?: string;
  @ApiPropertyOptional() pharmacy_id?: string;
}

export class UpdateSystemSettingsDto {
  @ApiPropertyOptional() platformName?: string;
  @ApiPropertyOptional() platformLogoUrl?: string;
  @ApiPropertyOptional() adminEmail?: string;
  @ApiPropertyOptional() supportEmail?: string;
  @ApiPropertyOptional() maxPharmacies?: number;
  @ApiPropertyOptional() enableRegistrations?: boolean;
  @ApiPropertyOptional() enableNotifications?: boolean;
  @ApiPropertyOptional() scheduledMaintenance?: string;
  @ApiPropertyOptional() maxUsersPerPharmacy?: number;
  @ApiPropertyOptional() apiRateLimit?: number;
  @ApiPropertyOptional() enableWhiteLabel?: boolean;
  @ApiPropertyOptional() enableMultiBranch?: boolean;
  @ApiPropertyOptional() dataRetentionDays?: number;
  @ApiPropertyOptional() enableAuditLogs?: boolean;
  @ApiPropertyOptional() allowUserTwoFactor?: boolean;
  @ApiPropertyOptional() ipWhitelistEnabled?: boolean;
  [key: string]: unknown;
}

export class UpdateEmailTemplateDto {
  @ApiProperty() templateKey!: string;
  @ApiProperty() subject!: string;
  @ApiProperty() html!: string;
  @ApiPropertyOptional() text?: string;
  @ApiPropertyOptional() isActive?: boolean;
}

export class CreateFeatureDto {
  @ApiProperty() key!: string;
  @ApiProperty() display_name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional() group?: string;
  @ApiPropertyOptional() feature_type?: string;
  @ApiPropertyOptional() limit_column?: string;
  @ApiPropertyOptional() nav_routes?: string[];
  @ApiPropertyOptional() sort_order?: number;
  @ApiPropertyOptional() is_active?: boolean;
}

export class UpdateFeatureDto {
  @ApiPropertyOptional() display_name?: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional() group?: string;
  @ApiPropertyOptional() feature_type?: string;
  @ApiPropertyOptional() limit_column?: string;
  @ApiPropertyOptional() nav_routes?: string[];
  @ApiPropertyOptional() sort_order?: number;
  @ApiPropertyOptional() is_active?: boolean;
}

export class CreateApiKeyDto {
  @ApiProperty() name!: string;
  @ApiProperty() key!: string;
  @ApiPropertyOptional() permissions?: string[];
}

export class UpdateApiKeyDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional() name?: string;
  @ApiPropertyOptional() key?: string;
  @ApiPropertyOptional() status?: string;
  @ApiPropertyOptional() permissions?: string[];
}

export class AddIpWhitelistDto {
  @ApiProperty() ip!: string;
  @ApiPropertyOptional() description?: string;
}

export class DeleteIpWhitelistDto {
  @ApiProperty() id!: string;
}

export class CreateBackupDto {
  @ApiPropertyOptional() type?: string;
  @ApiPropertyOptional() pharmacy_id?: string;
}

export class AdminCreateCategoryDto {
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
}

export class AdminUpdateCategoryDto {
  @ApiPropertyOptional() name?: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional() status?: string;
}

export class CreateInsuranceTemplateDto {
  @ApiProperty() name!: string;
  @ApiProperty() insurance_provider!: string;
  @ApiPropertyOptional() template_html?: string;
  @ApiPropertyOptional() template_css?: string;
}

export class UpdateInsuranceTemplateDto {
  @ApiPropertyOptional() name?: string;
  @ApiPropertyOptional() insurance_provider?: string;
  @ApiPropertyOptional() template_html?: string;
  @ApiPropertyOptional() template_css?: string;
  @ApiPropertyOptional() is_active?: boolean;
}

export class SuperadminCreatePharmacyDto {
  @ApiProperty() name!: string;
  @ApiPropertyOptional() location?: string;
  @ApiPropertyOptional() owner_phone?: string;
  @ApiPropertyOptional() owner_email?: string;
  @ApiPropertyOptional() plan?: string;
}

export class MaintenanceNotifyDto {
  @ApiProperty() message!: string;
  @ApiProperty() scheduledAt!: string;
}
