import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CategoryDto {
  @ApiProperty({ description: "Category identifier.", example: "8a8d7f2c-3f04-4d8e-98ad-95f47921a3de", format: "uuid" })
  id!: string;

  @ApiProperty({ description: "Display name of the category.", example: "Antibiotics" })
  name!: string;

  @ApiProperty({ description: "Optional category description.", example: "Prescription antibacterial medicines.", nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ description: "Category ownership scope.", example: "pharmacy", enum: ["global", "platform", "pharmacy"] })
  scope?: string;

  @ApiPropertyOptional({ description: "Owning pharmacy identifier.", example: "ef829450-3a46-4553-a319-253b194e9b2e", format: "uuid", nullable: true })
  pharmacy_id?: string | null;

  @ApiPropertyOptional({ description: "Whether the category is active.", example: true, nullable: true })
  is_active?: boolean | null;

  @ApiPropertyOptional({ description: "Category creation time.", example: "2026-07-01T08:00:00.000Z", format: "date-time", nullable: true })
  created_at?: Date | null;

  @ApiPropertyOptional({ description: "Most recent category update time.", example: "2026-07-21T11:30:00.000Z", format: "date-time", nullable: true })
  updated_at?: Date | null;
}

export class CategoryMutationResponseDto {
  @ApiProperty({ description: "Whether the operation succeeded.", example: true })
  success!: boolean;

  @ApiProperty({ description: "Created or updated category.", type: CategoryDto })
  category!: CategoryDto;
}

export class CategoryDeleteResponseDto {
  @ApiProperty({ description: "Whether the category was deleted.", example: true })
  success!: boolean;
}
