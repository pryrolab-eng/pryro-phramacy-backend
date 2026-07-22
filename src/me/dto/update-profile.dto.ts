import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: "Short display name.", example: "Aline", required: false })
  name?: string;

  @ApiPropertyOptional({ description: "Full display name.", example: "Aline Uwase", required: false })
  full_name?: string;
}
