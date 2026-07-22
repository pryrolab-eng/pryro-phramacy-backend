import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

const PROVIDER_ID = "72c68d58-6137-4f92-9eb8-9b46cc93056d";
const MEDICATION_ID = "bd6f3348-509f-4654-a56d-da9a281bbcf0";
const CLAIM_ID = "8bf6d49a-ddb5-4d94-8714-0c53cbf32a35";

export class CreateInsuranceProviderDto {
  @ApiProperty({ example: "RSSB" }) name!: string;
  @ApiProperty({ example: 90 }) coverage_percentage!: number | string;
  @ApiPropertyOptional({ example: "claims@rssb.rw" }) contact_email?: string;
  @ApiPropertyOptional({ example: "+250788000000" }) contact_phone?: string;
  @ApiPropertyOptional({ example: "RSSB-2026" }) policy_number?: string;
  @ApiPropertyOptional({ example: "default" }) invoice_template?: string;
  @ApiPropertyOptional({ type: Object, example: {} }) template_config?: Record<string, unknown>;
}

export class UpdateInsuranceProviderDto {
  @ApiPropertyOptional({ example: "RSSB" }) name?: string;
  @ApiPropertyOptional({ example: 90 }) coverage_percentage?: number | string;
  @ApiPropertyOptional({ example: 90 }) default_coverage_percent?: number | string;
  @ApiPropertyOptional({ example: "claims@rssb.rw", nullable: true }) contact_email?: string | null;
  @ApiPropertyOptional({ example: "+250788000000", nullable: true }) contact_phone?: string | null;
  @ApiPropertyOptional({ example: "RSSB-2026", nullable: true }) policy_number?: string | null;
  @ApiPropertyOptional({ example: true }) is_active?: boolean;
}

export class InsuranceLookupDto {
  @ApiProperty({ example: "RSSB-00123456" }) insuranceNumber!: string;
}

export class InsurancePricingUpdateDto {
  @ApiProperty({ example: "RSSB" }) insurance!: string;
  @ApiProperty({
    type: Object,
    additionalProperties: true,
    example: { "Amoxicillin 500 mg": 0 },
  })
  priceList!: Record<string, unknown>;
}

export class CoverageLineInputDto {
  @ApiPropertyOptional({ format: "uuid" }) inventoryId?: string;
  @ApiProperty({ example: MEDICATION_ID, format: "uuid" }) medicationId!: string;
  @ApiPropertyOptional({ example: "Amoxicillin 500 mg" }) medicationName?: string;
  @ApiPropertyOptional({ example: 2 }) quantity?: number;
  @ApiPropertyOptional({ example: 1500 }) shelfUnitPrice?: number;
  @ApiPropertyOptional({ example: 1500 }) price?: number;
}

export class CoveragePreviewDto {
  @ApiPropertyOptional({ example: PROVIDER_ID }) providerId?: string;
  @ApiPropertyOptional({ example: "RSSB" }) insuranceType?: string;
  @ApiPropertyOptional({ example: "RSSB" }) insurance?: string;
  @ApiProperty({ type: CoverageLineInputDto, isArray: true }) lines!: CoverageLineInputDto[];
}

export class ProcessInsuranceDto extends CoveragePreviewDto {
  @ApiPropertyOptional({ format: "uuid" }) saleId?: string;
  @ApiPropertyOptional({ example: "Mukamana Alice" }) patientName?: string;
  @ApiPropertyOptional({ example: "Mukamana Alice" }) clientName?: string;
  @ApiPropertyOptional({ example: "1199887766554433" }) patientId?: string;
  @ApiPropertyOptional({ example: 2700 }) insuranceCoverage?: number;
  @ApiPropertyOptional({ example: 300 }) patientCopay?: number;
  @ApiPropertyOptional({ example: 3000 }) totalAmount?: number;
  @ApiPropertyOptional({ example: "Manual submission" }) notes?: string;
  @ApiPropertyOptional({ type: Object, additionalProperties: true }) metadata?: Record<string, unknown>;
}

export class FormularyItemDto {
  @ApiProperty({ example: MEDICATION_ID, format: "uuid" }) medicationId!: string;
  @ApiPropertyOptional({ example: "RSSB-AMX-500" }) externalCode?: string;
}

export class ApplyFormularyDto {
  @ApiProperty({ example: "RSSB" }) insurance!: string;
  @ApiProperty({ type: FormularyItemDto, isArray: true }) items!: FormularyItemDto[];
}

export class UpdateClaimStatusDto {
  @ApiProperty({ enum: ["pending", "processing", "approved", "rejected"], example: "approved" })
  status!: string;
  @ApiPropertyOptional({ example: "Verified against submitted documents" }) notes?: string;
  @ApiPropertyOptional({ example: 2700 }) approvedAmount?: number;
}

export class InsuranceProviderDto {
  @ApiProperty({ example: PROVIDER_ID, format: "uuid" }) id!: string;
  @ApiProperty({ example: null, format: "uuid", nullable: true }) pharmacy_id!: string | null;
  @ApiProperty({ example: "RSSB" }) name!: string;
  @ApiProperty({ example: "90.00", nullable: true }) coverage_percentage!: string | number | null;
  @ApiProperty({ example: "90.00", nullable: true }) default_coverage_percent!: string | number | null;
  @ApiProperty({ example: true, nullable: true }) is_active!: boolean | null;
}

export class ProviderMutationResponseDto {
  @ApiProperty({ example: true }) success!: boolean;
  @ApiProperty({ type: InsuranceProviderDto }) insurance!: InsuranceProviderDto;
  @ApiProperty({ example: "Insurance provider added successfully" }) message!: string;
}

export class LookupResponseDto {
  @ApiProperty({ example: true }) success!: boolean;
  @ApiProperty({ format: "uuid" }) customerId!: string;
  @ApiProperty({ example: "Mukamana Alice" }) customerName!: string;
  @ApiProperty({ example: "RSSB" }) insuranceType!: string;
  @ApiProperty({ example: 90 }) coveragePercent!: number;
  @ApiProperty({ example: "active" }) status!: string;
  @ApiProperty({ example: "customers" }) source!: string;
}

export class PricingResponseDto {
  @ApiProperty({ example: 1500, nullable: true }) price!: number | null;
  @ApiPropertyOptional({ example: true }) isCovered?: boolean;
  @ApiPropertyOptional({ example: 90, nullable: true }) coveragePercent?: number | null;
  @ApiPropertyOptional({ example: "covered", nullable: true }) reason?: string | null;
}

export class CoverageLineResultDto {
  @ApiProperty({ example: MEDICATION_ID }) medicationId!: string;
  @ApiProperty({ example: 2 }) quantity!: number;
  @ApiProperty({ example: true }) isCovered!: boolean;
  @ApiProperty({ example: 1500 }) shelfUnitPrice!: number;
  @ApiProperty({ example: 1500 }) insuredUnitPrice!: number;
  @ApiProperty({ example: 90 }) coveragePercent!: number;
  @ApiProperty({ example: 2700 }) insurerPays!: number;
  @ApiProperty({ example: 300 }) patientPays!: number;
}

export class CoverageResponseDto {
  @ApiProperty({ example: true }) success!: boolean;
  @ApiProperty({ example: 3000 }) subtotal!: number;
  @ApiProperty({ example: 2700 }) insuranceCoverage!: number;
  @ApiProperty({ example: 300 }) patientCopay!: number;
  @ApiProperty({ type: CoverageLineResultDto, isArray: true }) lines!: CoverageLineResultDto[];
}

export class CoverageUpdateResponseDto {
  @ApiProperty({ example: true }) success!: boolean;
  @ApiProperty({ example: 3 }) upserted!: number;
  @ApiPropertyOptional({ type: String, isArray: true }) errors?: string[];
}

export class ProcessInsuranceResponseDto {
  @ApiProperty({ example: true }) success!: boolean;
  @ApiProperty({
    example: {
      claimId: CLAIM_ID,
      claimNumber: "CLM-2026-0001",
      approvalCode: "CLM-2026-0001",
      status: "pending",
    },
  })
  claim!: Record<string, unknown>;
  @ApiProperty({ example: { subtotal: 3000, insuranceCoverage: 2700, patientCopay: 300 } })
  totals!: Record<string, number>;
  @ApiProperty({ example: "Insurance claim saved" }) message!: string;
}

export class ApplyFormularyResponseDto {
  @ApiProperty({ example: true }) success!: boolean;
  @ApiProperty({ example: 2 }) applied!: number;
  @ApiProperty({
    example: [],
    isArray: true,
    type: Object,
  })
  failures!: Array<{ medicationId: string; error: string }>;
}

export class UpdateClaimStatusResponseDto {
  @ApiProperty({ example: true }) success!: boolean;
  @ApiProperty({
    example: {
      id: CLAIM_ID,
      status: "approved",
      approved_amount: "2700.00",
      processed_at: "2026-07-21T12:00:00.000Z",
      notes: "Verified",
    },
  })
  claim!: Record<string, unknown>;
}
