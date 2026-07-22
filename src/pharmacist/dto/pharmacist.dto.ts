import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreatePharmacistDto {
  @ApiProperty({ example: "pharmacy-uuid" })
  pharmacy_id!: string;

  @ApiProperty({ example: "john@example.com" })
  email!: string;

  @ApiProperty({ example: "John Doe" })
  full_name!: string;

  @ApiProperty({ example: "+250788123456" })
  phone!: string;

  @ApiPropertyOptional({ example: "pharmacist" })
  role?: string;

  @ApiPropertyOptional({ example: "Pryrox Pharmacy" })
  pharmacy_name?: string;

  @ApiPropertyOptional({ example: "temporaryPass123" })
  password?: string;
}

export class PharmacistStatsDto {
  @ApiProperty({ example: 12 }) prescriptionsToday!: number;
  @ApiProperty({ example: 8 }) customersServed!: number;
  @ApiProperty({ example: 8 }) averageWaitTime!: number;
  @ApiProperty({ example: 8 }) completedSales!: number;
  @ApiProperty({ example: 3 }) pendingPrescriptions!: number;
  @ApiProperty({ example: 3 }) consultationsGiven!: number;
  @ApiProperty({ example: 0 }) inventoryChecks!: number;
  @ApiProperty({ example: 2 }) alertsHandled!: number;
}

export class PharmacistActivityDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: "sale" }) type!: string;
  @ApiProperty({ example: "Sale to John - 5000 RWF" }) description!: string;
  @ApiProperty({ example: "10:30 AM" }) time!: string;
  @ApiProperty({ example: "completed" }) status!: string;
}

export class PharmacistChartPointDto {
  @ApiProperty({ example: "9:00" }) time!: string;
  @ApiProperty({ example: 2 }) prescriptions!: number;
  @ApiProperty({ example: 5 }) customers!: number;
}

export class PendingPrescriptionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: "John Doe" }) patient!: string;
  @ApiProperty({ example: "Dr. Smith" }) doctor!: string;
  @ApiProperty({ type: [String] }) medications!: string[];
  @ApiProperty({ example: "high" }) priority!: string;
  @ApiProperty({ example: "10:30 AM" }) time!: string;
  @ApiProperty({ example: "RSSB" }) insurance!: string;
}

export class ProcessPrescriptionDto {
  @ApiProperty() prescriptionId!: string;
  @ApiProperty({ enum: ["start", "dispense"] })
  action!: "start" | "dispense";
}

export class CreatePharmacistResponseDto {
  @ApiProperty({ example: true }) success!: boolean;
  @ApiPropertyOptional() userId?: string;
  @ApiPropertyOptional() message?: string;
  @ApiPropertyOptional() emailSent?: boolean;
  @ApiPropertyOptional() emailError?: string;
  @ApiPropertyOptional() error?: string;
}

export class TrackActivityDto {
  @ApiProperty() type!: string;
  @ApiProperty({ type: "object", additionalProperties: true }) data!: Record<string, unknown>;
}

export class SuccessDto {
  @ApiProperty({ example: true }) success!: boolean;
}
