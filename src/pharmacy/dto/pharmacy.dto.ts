import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SuccessResponseDto } from "../../common/dto";

export class DashboardStatsDto {
  @ApiProperty({ example: 128 }) totalProducts!: number;
  @ApiProperty({ example: 0 }) lowStockItems!: number;
  @ApiProperty({ example: 18500 }) todaySales!: number;
  @ApiProperty({ example: 540000 }) monthlyRevenue!: number;
  @ApiProperty({ example: 42 }) totalCustomers!: number;
  @ApiProperty({ example: 6 }) activeStaff!: number;
  @ApiProperty({ example: 37 }) pendingOrders!: number;
  @ApiProperty({ example: 0 }) expiringProducts!: number;
  @ApiPropertyOptional({ nullable: true, example: null }) branchId?: string | null;
}

export class CombinedDashboardDto {
  @ApiProperty({ type: DashboardStatsDto }) stats!: DashboardStatsDto;
  @ApiProperty({ type: "array", items: { type: "object" } }) recentSales!: object[];
  @ApiProperty({ type: "object", additionalProperties: true }) stockAlerts!: object;
  @ApiProperty({ type: "array", items: { type: "object" } }) salesChart!: object[];
  @ApiProperty({ type: "array", items: { type: "object" } }) weeklySales!: object[];
  @ApiProperty({ type: "array", items: { type: "object" } }) categorySales!: object[];
  @ApiProperty({ type: "array", items: { type: "object" } }) inventoryChart!: object[];
}

export class PharmacySettingsDto {
  @ApiProperty({ example: "Pryrox Pharmacy" }) name!: string;
  @ApiProperty({ nullable: true, example: "PH-1234" }) license!: string | null;
  @ApiProperty({ example: "Kigali, Kigali City" }) location!: string;
  @ApiProperty({ nullable: true, example: "+250788123456" }) phone!: string | null;
  @ApiProperty({ nullable: true, example: "info@pharmacy.test" }) email!: string | null;
  @ApiProperty({ example: "professional" }) subscription!: string;
  @ApiProperty({ nullable: true, example: null }) subscriptionExpiresAt!: Date | null;
  @ApiProperty({ example: "RWF" }) currency!: string;
  @ApiProperty({ example: "en" }) language!: string;
}

export class UpdatePharmacySettingsDto {
  @ApiProperty({ example: "Pryrox Pharmacy" }) name!: string;
  @ApiProperty({ example: "+250788123456" }) phone!: string;
  @ApiProperty({ example: "info@pharmacy.test" }) email!: string;
  @ApiPropertyOptional({ example: "Kigali, Kigali City" }) location?: string;
  @ApiPropertyOptional({ example: "RWF" }) currency?: string;
  @ApiPropertyOptional({ example: "en" }) language?: string;
}

export class PharmacyBrandingDto {
  @ApiProperty({ example: "Pryrox Pharmacy" }) platformName!: string;
  @ApiProperty({ example: "/api/files/pharmacy-logos/logo.png" }) logoUrl!: string;
  @ApiProperty({ example: "#171717" }) primaryColor!: string;
  @ApiProperty({ example: "" }) customDomain!: string;
}

export class UpdatePharmacyBrandingDto {
  @ApiPropertyOptional({ example: "Pryrox Pharmacy" }) platformName?: string;
  @ApiPropertyOptional({ example: "https://cdn.example.test/logo.png" }) logoUrl?: string;
  @ApiPropertyOptional({ example: "#171717" }) primaryColor?: string;
  @ApiPropertyOptional({ example: "pharmacy.example.test" }) customDomain?: string;
}

export class LogoUploadDto {
  @ApiProperty({ type: "string", format: "binary" })
  file!: unknown;
}

export class LogoUploadResponseDto extends SuccessResponseDto {
  @ApiProperty({ example: "/api/files/pharmacy-logos/pharmacy-id-123.png" })
  url!: string;
}

export class InvoiceTemplateDto {
  @ApiProperty({ example: true }) showLogo!: boolean;
  @ApiProperty({ type: [String] }) headerFields!: string[];
  @ApiProperty({ type: [String] }) patientFields!: string[];
  @ApiProperty({ type: [String] }) productFields!: string[];
  @ApiProperty({ example: true }) showTax!: boolean;
  @ApiProperty({ example: true }) showInsuranceSplit!: boolean;
  @ApiProperty({ example: "Thank you for your business" }) footerText!: string;
}

export class InvoiceTemplateUpdateResponseDto extends SuccessResponseDto {
  @ApiProperty({ type: InvoiceTemplateDto })
  template!: InvoiceTemplateDto;
}

export class ActivityLogsResponseDto {
  @ApiProperty({ type: "array", items: { type: "object" } }) items!: object[];
  @ApiProperty({ example: 42 }) total!: number;
  @ApiPropertyOptional({ example: 25 }) limit?: number;
  @ApiPropertyOptional({ example: 0 }) offset?: number;
  @ApiPropertyOptional({ type: "object", additionalProperties: true }) stats?: object;
  @ApiPropertyOptional({ type: "object", additionalProperties: true }) facets?: object;
  @ApiPropertyOptional({ example: "audit_logs_disabled" }) error?: string;
}

export class MedicationCoveragePatchDto {
  @ApiProperty({ example: "21f777ae-e1b4-4a66-b193-72d89f922f49" })
  medicationId!: string;
  @ApiProperty({ example: "c5ce1fee-56f7-4a47-8261-816ea3beab30" })
  providerId!: string;
  @ApiProperty({ example: true }) covered!: boolean;
  @ApiPropertyOptional({ example: "RSSB-PAR-500" }) externalCode?: string;
  @ApiPropertyOptional({ example: "Prior approval required" }) notes?: string;
  @ApiPropertyOptional({ example: "2026-01-01" }) effectiveFrom?: string;
  @ApiPropertyOptional({ nullable: true, example: null }) effectiveTo?: string | null;
}

export class MedicationCoveragePatchResponseDto extends SuccessResponseDto {
  @ApiProperty() medicationId!: string;
  @ApiProperty() providerId!: string;
  @ApiProperty() covered!: boolean;
  @ApiProperty({ nullable: true }) externalCode!: string | null;
  @ApiProperty({ nullable: true }) notes!: string | null;
}

export class SeedDemoResponseDto extends SuccessResponseDto {
  @ApiPropertyOptional({ type: "object", additionalProperties: true }) result?: object;
  @ApiPropertyOptional({ example: "Demo seed is disabled in this environment" })
  error?: string;
}
