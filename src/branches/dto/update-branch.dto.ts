import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateBranchDto {
  @ApiPropertyOptional({ description: "New display name for the branch.", example: "Kigali Downtown Branch" })
  name?: string;

  @ApiPropertyOptional({ description: "New street address. Explicit null clears the stored address.", example: "KN 4 Ave 22, Kigali", nullable: true })
  address?: string | null;

  @ApiPropertyOptional({ description: "Legacy alias for `address`, used when `address` is omitted.", example: "KN 4 Ave 22, Kigali", nullable: true })
  location?: string | null;

  @ApiPropertyOptional({ description: "New branch phone number. Explicit null clears the stored phone.", example: "+250788123456", nullable: true })
  phone?: string | null;

  @ApiPropertyOptional({ description: "New branch email address. Explicit null clears the stored email.", example: "downtown@pryrox-pharmacy.rw", nullable: true })
  email?: string | null;

  @ApiPropertyOptional({ description: "Whether the branch is active. Takes precedence over `status`.", example: true })
  is_active?: boolean;

  @ApiPropertyOptional({ description: "Legacy activity flag applied when `is_active` is omitted; any value other than 'active' deactivates the branch.", example: "active", enum: ["active", "inactive"] })
  status?: string;
}
