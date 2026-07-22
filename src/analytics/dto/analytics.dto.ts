import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AnalyticsResponseDto {
  @ApiProperty({ type: "object", additionalProperties: true })
  salesTrends!: Record<string, unknown>;

  @ApiProperty({ type: "array", items: { type: "object" } })
  topProducts!: Array<Record<string, unknown>>;

  @ApiProperty({ type: "object", additionalProperties: true })
  customerInsights!: Record<string, unknown>;

  @ApiProperty({ type: "object", additionalProperties: true })
  predictions!: Record<string, unknown>;

  @ApiProperty({ type: "object", additionalProperties: true })
  insights!: Record<string, unknown>;
}
