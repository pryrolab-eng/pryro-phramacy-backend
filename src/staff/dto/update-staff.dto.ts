import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateStaffDto {
  @ApiPropertyOptional({ description: "New display name written to the linked user profile.", example: "Jean Bosco Mugisha" })
  name?: string;

  @ApiPropertyOptional({ description: "New phone number. Accepted for compatibility; the current profile store does not persist it.", example: "+250788123456" })
  phone?: string;

  @ApiPropertyOptional({ description: "New pharmacy role for the staff member.", example: "pharmacist", enum: ["pharmacy_owner", "pharmacist", "cashier", "staff"] })
  role?: string;

  @ApiPropertyOptional({ description: "Activity flag; any value other than 'inactive' marks the member active.", example: "active", enum: ["active", "inactive"] })
  status?: string;

  @ApiPropertyOptional({ description: "New password for the linked account. When set, the member must change it at next sign-in.", example: "Temp1234!", format: "password" })
  password?: string;
}
