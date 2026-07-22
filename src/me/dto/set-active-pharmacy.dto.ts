import { ApiProperty } from "@nestjs/swagger";

export class SetActivePharmacyDto {
  @ApiProperty({ description: "Accessible pharmacy to make active.", example: "ef829450-3a46-4553-a319-253b194e9b2e", required: true, format: "uuid" })
  pharmacyId!: string;
}
