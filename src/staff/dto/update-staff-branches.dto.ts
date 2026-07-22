import { ApiProperty } from "@nestjs/swagger";

export class UpdateStaffBranchesDto {
  @ApiProperty({
    description: "Branch UUIDs the staff member may access. An empty array removes all restrictions (unrestricted access).",
    type: [String],
    example: ["8150740a-5ee8-4f92-8337-a72c7e390b9e"],
  })
  branchIds!: string[];
}
