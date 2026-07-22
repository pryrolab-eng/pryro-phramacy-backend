import { ApiProperty } from "@nestjs/swagger";

const BRANCH_ID_EXAMPLE = "8150740a-5ee8-4f92-8337-a72c7e390b9e";

export class DeprecatedBranchesResponseDto {
  @ApiProperty({ description: "Stable deprecation error code.", example: "deprecated_endpoint" })
  error!: string;

  @ApiProperty({ description: "Explanation of which endpoint replaces this route.", example: "Use /api/saas/branches for branch listing and creation." })
  message!: string;
}

export class BranchDto {
  @ApiProperty({ description: "Branch identifier.", example: BRANCH_ID_EXAMPLE, format: "uuid" })
  id!: string;

  @ApiProperty({ description: "Branch display name.", example: "Kigali Downtown Branch" })
  name!: string;

  @ApiProperty({ description: "Branch street address.", example: "KN 4 Ave 22, Kigali", nullable: true })
  address!: string | null;

  @ApiProperty({ description: "Branch phone number.", example: "+250788123456", nullable: true })
  phone!: string | null;

  @ApiProperty({ description: "Branch email address.", example: "downtown@pryrox-pharmacy.rw", nullable: true })
  email!: string | null;

  @ApiProperty({ description: "Whether the branch is active.", example: true, nullable: true })
  is_active!: boolean | null;

  @ApiProperty({ description: "Most recent branch update time.", example: "2026-07-21T11:30:00.000Z", format: "date-time", nullable: true })
  updated_at!: Date | null;
}

export class UpdateBranchResponseDto {
  @ApiProperty({ description: "Whether the update succeeded.", example: true })
  success!: boolean;

  @ApiProperty({ description: "The updated branch.", type: BranchDto })
  branch!: BranchDto;
}

export class BranchInventoryItemDto {
  @ApiProperty({ description: "Inventory record identifier.", example: "c1d9a1f0-6a3f-4f4e-9f0a-2f1f7f9a3b21", format: "uuid" })
  id!: string;

  @ApiProperty({ description: "Medication name.", example: "Amoxicillin 500mg" })
  name!: string;

  @ApiProperty({ description: "Units currently in stock; missing stock counts are reported as zero.", example: 120 })
  stock!: number;

  @ApiProperty({ description: "Selling price per unit; missing prices are reported as zero.", example: 500 })
  price!: number;

  @ApiProperty({ description: "Medication category name.", example: "Antibiotics" })
  category!: string;

  @ApiProperty({ description: "Batch number of the inventory record.", example: "BATCH-2026-014" })
  batchNumber!: string;

  @ApiProperty({ description: "Expiry date in YYYY-MM-DD form.", example: "2027-03-31", nullable: true })
  expiryDate!: string | null;
}
