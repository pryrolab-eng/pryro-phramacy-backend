import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class OnboardingStatusResponseDto {
  @ApiProperty() step!: number;
  @ApiProperty({ nullable: true }) pharmacy: Record<string, unknown> | null = null;
  @ApiProperty({ nullable: true }) pendingPlan: Record<string, unknown> | null = null;
  @ApiProperty() completed!: boolean;
}

export class CreatePharmacyDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() license_number?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiProperty() @IsString() phone!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
}

export class CreatePharmacyResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty() pharmacyId!: string;
  @ApiProperty({ required: false }) alreadyExists?: boolean;
}
