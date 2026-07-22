import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MAX_IMPORT_ROWS } from "../models";

export class ImportCustomerRowDto {
  @ApiProperty({ description: "Customer full name.", example: "Aline Uwase" })
  name!: string;

  @ApiProperty({ description: "Customer phone number.", example: "+250788123456" })
  phone!: string;

  @ApiPropertyOptional({ description: "Customer email.", example: "aline.uwase@example.com", format: "email" })
  email?: string;

  @ApiPropertyOptional({ description: "Customer birth date.", example: "1992-08-17", format: "date" })
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: "Comma- or semicolon-separated allergies.", example: "Penicillin; Aspirin" })
  allergies?: string;

  @ApiPropertyOptional({ description: "Insurance membership number.", example: "RSSB-2049381" })
  insurance?: string;
}

export class ImportCustomersDto {
  @ApiProperty({
    description: `Customer rows to import (1–${MAX_IMPORT_ROWS}).`,
    type: [ImportCustomerRowDto],
    minItems: 1,
    maxItems: MAX_IMPORT_ROWS,
    example: [{ name: "Aline Uwase", phone: "+250788123456", email: "aline.uwase@example.com", dateOfBirth: "1992-08-17", allergies: "Penicillin; Aspirin", insurance: "RSSB-2049381" }],
  })
  rows!: ImportCustomerRowDto[];
}
