import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({ description: "Days before subscription expiry to send renewal reminders.", example: [14, 7, 3, 1], type: [Number] })
  subscriptionRenewalDays?: number[];
  @ApiPropertyOptional({ description: "Receive daily summary notifications.", example: true, default: true })
  dailyUpdate?: boolean;

  @ApiPropertyOptional({ description: "Receive low-stock notifications.", example: true, default: true })
  lowStock?: boolean;

  @ApiPropertyOptional({ description: "Receive medication expiry notifications.", example: true, default: true })
  expiry?: boolean;

  @ApiPropertyOptional({ description: "Receive sales report notifications.", example: true, default: false })
  salesReports?: boolean;

  @ApiPropertyOptional({ description: "Receive system update notifications.", example: true, default: true })
  systemUpdates?: boolean;

  @ApiPropertyOptional({ description: "Enable email delivery.", example: true, default: true })
  email?: boolean;

  @ApiPropertyOptional({ description: "Enable in-app/desktop delivery.", example: true, default: true })
  desktop?: boolean;

  @ApiPropertyOptional({ description: "Enable web push delivery.", example: true, default: false })
  push?: boolean;
}
