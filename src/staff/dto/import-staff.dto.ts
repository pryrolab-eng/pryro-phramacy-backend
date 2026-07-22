import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MAX_IMPORT_ROWS } from "../models";

export class ImportStaffRowDto {
  @ApiProperty({ description: "Staff member's full name.", example: "Jean Bosco Mugisha" })
  fullName!: string;

  @ApiProperty({ description: "Work email address used to create the invited account.", example: "jean.mugisha@example.com", format: "email" })
  email!: string;

  @ApiProperty({ description: "Staff member's phone number.", example: "+250788123456" })
  phone!: string;

  @ApiPropertyOptional({ description: "Pharmacy role assigned to the invited member. Defaults to 'staff'.", example: "cashier" })
  role?: string;
}

export class ImportStaffDto {
  @ApiPropertyOptional({ description: "Pharmacy display name used in invitation emails.", example: "Pryrox Pharmacy Kigali" })
  pharmacy_name?: string;

  @ApiProperty({
    description: `Staff rows to import (1–${MAX_IMPORT_ROWS}).`,
    type: [ImportStaffRowDto],
    minItems: 1,
    maxItems: MAX_IMPORT_ROWS,
    example: [{ fullName: "Jean Bosco Mugisha", email: "jean.mugisha@example.com", phone: "+250788123456", role: "cashier" }],
  })
  rows!: ImportStaffRowDto[];
}
