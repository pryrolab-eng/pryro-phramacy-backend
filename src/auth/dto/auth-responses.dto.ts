import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AuthenticatedUserDto {
  @ApiProperty({ description: "Authenticated user identifier.", example: "a8203177-f7c9-4b11-a54f-454b7d33033f", format: "uuid" })
  id!: string;
  @ApiProperty({ description: "Authenticated user's email address.", example: "aline@example.rw", format: "email", nullable: true })
  email!: string | null;
  @ApiPropertyOptional({ description: "Authentication-provider metadata.", example: { full_name: "Aline Uwase" }, type: "object", additionalProperties: true })
  user_metadata?: Record<string, unknown>;
}
export class AuthMeResponseDto {
  @ApiProperty({ description: "Current authenticated user.", type: AuthenticatedUserDto })
  user!: AuthenticatedUserDto;
}
export class InternalServerErrorDto {
  @ApiProperty({ description: "HTTP status code.", example: 500 }) statusCode!: number;
  @ApiProperty({ description: "Failure message.", example: "Internal server error" }) message!: string;
}
