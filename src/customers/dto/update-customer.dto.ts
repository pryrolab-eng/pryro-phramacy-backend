import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateCustomerDto {
  @ApiPropertyOptional({ description: "Updated full name.", example: "Aline U. Uwase" })
  name?: string;

  @ApiPropertyOptional({ description: "Updated phone number.", example: "+250788654321" })
  phone?: string;

  @ApiPropertyOptional({ description: "Updated email, or null/empty to clear.", example: "aline.uwase@example.com", format: "email", nullable: true })
  email?: string | null;

  @ApiPropertyOptional({ description: "Updated birth date, or null/empty to clear.", example: "1992-08-17", format: "date", nullable: true })
  dateOfBirth?: string | null;

  @ApiPropertyOptional({ description: "Updated comma-separated allergy names.", example: "Penicillin, Aspirin" })
  allergies?: string;

  @ApiPropertyOptional({ description: "Updated insurance number, or null/empty to clear.", example: "RSSB-2049381", nullable: true })
  insurance?: string | null;

  @ApiPropertyOptional({ description: "Updated activity status; values other than `inactive` are treated as active.", example: "active", enum: ["active", "inactive"] })
  status?: "active" | "inactive";
}
