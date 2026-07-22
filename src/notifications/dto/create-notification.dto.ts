import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateNotificationDto {
  @ApiProperty({ description: "Short notification heading.", example: "Stock count completed" })
  title!: string;

  @ApiProperty({ description: "Notification detail.", example: "The July inventory count has been reconciled." })
  message!: string;

  @ApiPropertyOptional({
    description: "Notification category; defaults to `info`.",
    example: "success",
    enum: ["info", "success", "warning", "error", "low_stock", "expiry", "sales_report", "system_update"],
  })
  type?: string;
}
