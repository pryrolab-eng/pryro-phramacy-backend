import { ApiPropertyOptional } from "@nestjs/swagger";

export enum CategoryStatus {
  Active = "Active",
  Inactive = "Inactive",
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ description: "Updated category name.", example: "Antimicrobials", required: false })
  name?: string;

  @ApiPropertyOptional({ description: "Updated category description.", example: "Medicines used to treat infections.", required: false })
  description?: string;

  @ApiPropertyOptional({ description: "Activity status; only Active enables the category.", example: CategoryStatus.Active, required: false, enum: CategoryStatus })
  status?: CategoryStatus;
}
