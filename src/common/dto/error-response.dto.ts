import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ErrorResponseDto {
  @ApiProperty({
    description: "Human-readable explanation of the request failure.",
    example: "Invalid inventory data",
  })
  error!: string;

  @ApiPropertyOptional({
    description: "Machine-readable error code when the failure has a stable identifier.",
    example: "ENTITLEMENT_REQUIRED",
  })
  code?: string;

  @ApiPropertyOptional({
    description: "Feature identifier that must be enabled to resolve an entitlement failure.",
    example: "inventory.access",
  })
  upgradeFeature?: string;

  @ApiPropertyOptional({
    description: "False when the handler returns an explicit failure envelope.",
    example: false,
  })
  success?: boolean;

  @ApiPropertyOptional({
    description: "Optional lower-level detail about the failure.",
    example: "Category is required",
  })
  details?: string;
}
