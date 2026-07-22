import { ApiPropertyOptional } from "@nestjs/swagger";

export class CreateCategoryDto {
  @ApiPropertyOptional({ description: "Category name. Required unless categoryName is supplied.", example: "Antibiotics", required: false })
  name?: string;

  @ApiPropertyOptional({ description: "Legacy alias for name.", example: "Antibiotics", required: false })
  categoryName?: string;

  @ApiPropertyOptional({ description: "Optional category description.", example: "Prescription antibacterial medicines.", required: false })
  description?: string;

  @ApiPropertyOptional({ description: "Legacy alias for description.", example: "Prescription antibacterial medicines.", required: false })
  categoryDescription?: string;
}
