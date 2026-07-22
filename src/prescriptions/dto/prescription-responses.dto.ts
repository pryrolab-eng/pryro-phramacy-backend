import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

const PRESCRIPTION_ID = "be2ac216-c693-4283-931c-cf1a92192c6a";
const PHARMACY_ID = "37f5f20e-8d92-4d9c-b75e-f13e530bfa61";

export class PrescriptionDto {
  @ApiProperty({ description: "Prescription identifier.", example: PRESCRIPTION_ID, format: "uuid" })
  id!: string;

  @ApiProperty({ description: "Patient name.", example: "Aline Uwase" })
  patient!: string;

  @ApiProperty({ description: "Prescribing doctor's name.", example: "Dr. Eric Mugisha" })
  doctor!: string;

  @ApiProperty({ description: "Medication names on the prescription.", example: ["Amoxicillin 500 mg"] })
  medications!: string[];

  @ApiProperty({ description: "Prescription urgency.", example: "medium", enum: ["low", "medium", "high", "urgent"] })
  priority!: string;

  @ApiProperty({ description: "Prescription workflow status.", example: "pending", enum: ["pending", "dispensed", "completed", "cancelled"] })
  status!: string;

  @ApiProperty({ description: "Locale-formatted creation time, or an empty string.", example: "2:25:18 PM" })
  time!: string;

  @ApiProperty({ description: "Insurance provider, or `None` when none is recorded.", example: "RSSB" })
  insurance!: string;

  @ApiProperty({ description: "Prescription creation timestamp.", example: "2026-07-21T12:25:18.000Z", format: "date-time", nullable: true })
  created_at!: string | null;
}

export class StoredPrescriptionDto {
  @ApiProperty({ description: "Prescription identifier.", example: PRESCRIPTION_ID, format: "uuid" })
  id!: string;

  @ApiProperty({ description: "Owning pharmacy identifier.", example: PHARMACY_ID, format: "uuid", nullable: true })
  pharmacy_id!: string | null;

  @ApiProperty({ description: "Patient name.", example: "Aline Uwase" })
  patient_name!: string;

  @ApiProperty({ description: "Prescribing doctor's name.", example: "Dr. Eric Mugisha" })
  doctor_name!: string;

  @ApiProperty({ description: "Stored medication names.", example: ["Amoxicillin 500 mg"] })
  medications!: string[];

  @ApiProperty({ description: "Stored urgency.", example: "medium", enum: ["low", "medium", "high", "urgent"], nullable: true })
  priority!: string | null;

  @ApiProperty({ description: "Stored workflow status.", example: "pending", enum: ["pending", "dispensed", "completed", "cancelled"], nullable: true })
  status!: string | null;

  @ApiProperty({ description: "Stored insurance provider.", example: "RSSB", nullable: true })
  insurance_provider!: string | null;

  @ApiProperty({ description: "Stored notes.", example: "Take after meals.", nullable: true })
  notes!: string | null;

  @ApiProperty({ description: "Creation timestamp.", example: "2026-07-21T12:25:18.000Z", format: "date-time", nullable: true })
  created_at!: string | null;

  @ApiProperty({ description: "Last update timestamp.", example: "2026-07-21T12:25:18.000Z", format: "date-time", nullable: true })
  updated_at!: string | null;
}

export class PrescriptionMutationResponseDto {
  @ApiProperty({ description: "Whether the mutation succeeded.", example: true })
  success!: boolean;

  @ApiPropertyOptional({ description: "Created or updated database prescription.", type: StoredPrescriptionDto })
  prescription?: StoredPrescriptionDto;

  @ApiPropertyOptional({ description: "Failure message.", example: "Failed to create prescription" })
  error?: string;
}

export class DeletePrescriptionResponseDto {
  @ApiProperty({ description: "Whether the prescription was deleted.", example: true })
  success!: boolean;
}
