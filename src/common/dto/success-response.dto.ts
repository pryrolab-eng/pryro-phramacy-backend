import { ApiProperty } from "@nestjs/swagger";

export class SuccessResponseDto {
  @ApiProperty({ description: "Whether the operation succeeded.", example: true })
  success!: boolean;
}
