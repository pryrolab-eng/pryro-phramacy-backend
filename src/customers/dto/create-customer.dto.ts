import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateCustomerDto {
  @ApiProperty({ description: "Customer's full name. `patientName` is also accepted when creating.", example: "Aline Uwase" })
  name!: string;

  @ApiPropertyOptional({ description: "Legacy alias for `name` when creating.", example: "Aline Uwase" })
  patientName?: string;

  @ApiProperty({ description: "Customer phone number. `phoneNumber` is also accepted when creating.", example: "+250788123456" })
  phone!: string;

  @ApiPropertyOptional({ description: "Legacy alias for `phone` when creating.", example: "+250788123456" })
  phoneNumber?: string;

  @ApiPropertyOptional({ description: "Customer email address.", example: "aline.uwase@example.com", format: "email" })
  email?: string;

  @ApiPropertyOptional({ description: "Customer birth date.", example: "1992-08-17", format: "date" })
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: "Comma-separated allergy names.", example: "Penicillin, Aspirin" })
  allergies?: string;

  @ApiPropertyOptional({ description: "Insurance number. `insuranceNumber` is also accepted when creating.", example: "RSSB-2049381" })
  insurance?: string;

  @ApiPropertyOptional({ description: "Legacy alias for `insurance` when creating.", example: "RSSB-2049381" })
  insuranceNumber?: string;
}
