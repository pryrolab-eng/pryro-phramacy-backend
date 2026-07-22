import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreatePrescriptionDto {
  @ApiProperty({ description: "Patient name recorded on the prescription.", example: "Aline Uwase" })
  patient!: string;

  @ApiProperty({ description: "Prescribing doctor's name.", example: "Dr. Eric Mugisha" })
  doctor!: string;

  @ApiProperty({
    description: "Medication names on the prescription. A single string is also accepted for legacy clients.",
    example: ["Amoxicillin 500 mg", "Paracetamol 500 mg"],
    oneOf: [{ type: "array", items: { type: "string" } }, { type: "string" }],
  })
  medications!: string[] | string;

  @ApiPropertyOptional({
    description: "Prescription urgency. Missing or unsupported values are stored as medium.",
    example: "high",
    enum: ["low", "medium", "high", "urgent"],
  })
  priority?: string;

  @ApiPropertyOptional({
    description: "Patient insurance provider. Missing values are stored as `None`.",
    example: "RSSB",
  })
  insurance?: string | null;

  @ApiPropertyOptional({ description: "Additional dispensing notes.", example: "Take after meals." })
  notes?: string | null;
}

export class UpdatePrescriptionDto {
  @ApiPropertyOptional({ description: "Replacement patient name.", example: "Aline Uwase" })
  patient?: string;

  @ApiPropertyOptional({ description: "Replacement prescribing doctor's name.", example: "Dr. Eric Mugisha" })
  doctor?: string;

  @ApiPropertyOptional({
    description: "Replacement medication names. A single string is also accepted for legacy clients.",
    example: ["Amoxicillin 500 mg"],
    oneOf: [{ type: "array", items: { type: "string" } }, { type: "string" }],
  })
  medications?: string[] | string;

  @ApiPropertyOptional({
    description: "Replacement urgency. Unsupported values are normalized to medium.",
    example: "urgent",
    enum: ["low", "medium", "high", "urgent"],
  })
  priority?: string;

  @ApiPropertyOptional({
    description: "Replacement workflow status. Unsupported values leave the stored status unchanged.",
    example: "dispensed",
    enum: ["pending", "dispensed", "completed", "cancelled"],
  })
  status?: string;

  @ApiPropertyOptional({ description: "Replacement insurance provider.", example: "RSSB", nullable: true })
  insurance?: string | null;

  @ApiPropertyOptional({ description: "Replacement dispensing notes.", example: "Dispensed in full.", nullable: true })
  notes?: string | null;
}
