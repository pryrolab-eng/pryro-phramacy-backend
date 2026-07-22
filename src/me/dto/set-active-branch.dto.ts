import { ApiProperty } from "@nestjs/swagger";

export class SetActiveBranchDto {
  @ApiProperty({ description: "Accessible branch to make active.", example: "cd7a2193-7f09-45bc-b292-900572279c65", required: true, format: "uuid" })
  branchId!: string;
}
