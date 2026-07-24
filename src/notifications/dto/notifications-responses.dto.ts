import { ApiProperty } from "@nestjs/swagger";

const NOTIFICATION_ID_EXAMPLE = "30a7b13b-f41e-458f-8fb2-30ea9dca8794";

export class NotificationDto {
  @ApiProperty({ description: "Notification identifier.", example: NOTIFICATION_ID_EXAMPLE, format: "uuid" })
  id!: string;

  @ApiProperty({ description: "Short notification heading.", example: "Low stock warning" })
  title!: string;

  @ApiProperty({ description: "Notification detail.", example: "Amoxicillin 500 mg has 8 units remaining." })
  message!: string;

  @ApiProperty({ description: "Notification category.", example: "low_stock", nullable: true })
  type!: string | null;

  @ApiProperty({ description: "Whether the notification has been read.", example: false, nullable: true })
  read!: boolean | null;

  @ApiProperty({ description: "Notification creation time.", example: "2026-07-21T09:15:00.000Z", format: "date-time", nullable: true })
  date!: string | null;

  @ApiProperty({ description: "Optional application URL associated with the notification.", example: "/inventory/low-stock", nullable: true })
  actionUrl!: string | null;
}

export class StoredNotificationDto {
  @ApiProperty({ description: "Notification identifier.", example: NOTIFICATION_ID_EXAMPLE, format: "uuid" })
  id!: string;

  @ApiProperty({ description: "Short notification heading.", example: "Stock count completed" })
  title!: string;

  @ApiProperty({ description: "Notification detail.", example: "The July inventory count has been reconciled." })
  message!: string;

  @ApiProperty({ description: "Notification category.", example: "success", nullable: true })
  type!: string | null;

  @ApiProperty({ description: "Whether the notification has been read.", example: false, nullable: true })
  is_read!: boolean | null;

  @ApiProperty({ description: "Notification creation time.", example: "2026-07-21T09:15:00.000Z", format: "date-time", nullable: true })
  created_at!: string | null;

  @ApiProperty({ description: "Optional application URL in database field form.", example: "/inventory/low-stock", nullable: true })
  action_url!: string | null;
}

export class CreateNotificationResponseDto {
  @ApiProperty({ description: "Whether creation succeeded.", example: true })
  success!: boolean;

  @ApiProperty({ description: "Stored notification row.", type: StoredNotificationDto })
  notification!: StoredNotificationDto;
}

export class NotificationPreferencesDto {
  @ApiProperty({ description: "Receive daily summary notifications.", example: true })
  dailyUpdate!: boolean;

  @ApiProperty({ description: "Receive low-stock notifications.", example: true })
  lowStock!: boolean;

  @ApiProperty({ description: "Receive medication expiry notifications.", example: true })
  expiry!: boolean;

  @ApiProperty({ description: "Receive sales report notifications.", example: false })
  salesReports!: boolean;

  @ApiProperty({ description: "Receive system update notifications.", example: true })
  systemUpdates!: boolean;

  @ApiProperty({ description: "Enable email delivery.", example: true })
  email!: boolean;

  @ApiProperty({ description: "Enable in-app/desktop delivery.", example: true })
  desktop!: boolean;

  @ApiProperty({ description: "Enable web push delivery.", example: false })
  push!: boolean;

  @ApiProperty({
    description: "Days before subscription expiry to send renewal reminders.",
    example: [14, 7, 3, 1],
    type: [Number],
  })
  subscriptionRenewalDays!: number[];
}

export class MarkNotificationReadResponseDto {
  @ApiProperty({ description: "Whether the update succeeded.", example: true })
  success!: boolean;
}

export class PushSubscriptionDto {
  @ApiProperty({ description: "Subscription identifier.", example: "dcb8c5ad-cade-4ce7-8afd-a90ea148eb56", format: "uuid" })
  id!: string;

  @ApiProperty({ description: "Push service endpoint.", example: "https://fcm.googleapis.com/fcm/send/eXaMpLeToken", format: "uri" })
  endpoint!: string;

  @ApiProperty({ description: "Subscription creation time.", example: "2026-07-01T08:00:00.000Z", format: "date-time" })
  created_at!: string;

  @ApiProperty({ description: "Subscription last-update time.", example: "2026-07-21T09:30:00.000Z", format: "date-time" })
  updated_at!: string;
}

export class PushSubscriptionsResponseDto {
  @ApiProperty({ description: "Registered push endpoints without private key material.", type: [PushSubscriptionDto] })
  subscriptions!: PushSubscriptionDto[];
}

export class SavedPushSubscriptionDto {
  @ApiProperty({ description: "Subscription identifier.", example: "dcb8c5ad-cade-4ce7-8afd-a90ea148eb56", format: "uuid" })
  id!: string;

  @ApiProperty({ description: "Push service endpoint.", example: "https://fcm.googleapis.com/fcm/send/eXaMpLeToken", format: "uri" })
  endpoint!: string;

  @ApiProperty({ description: "Subscription last-update time.", example: "2026-07-21T09:30:00.000Z", format: "date-time" })
  updatedAt!: string;
}

export class SavePushSubscriptionResponseDto {
  @ApiProperty({ description: "Whether the subscription was saved.", example: true })
  success!: boolean;

  @ApiProperty({ description: "Saved subscription summary.", type: SavedPushSubscriptionDto })
  subscription!: SavedPushSubscriptionDto;
}

export class DeletePushSubscriptionResponseDto {
  @ApiProperty({ description: "Whether at least one subscription was deleted.", example: true })
  success!: boolean;
}

export class DeprecatedBroadcastResponseDto {
  @ApiProperty({ description: "Stable deprecation error code.", example: "deprecated", enum: ["deprecated"] })
  error!: "deprecated";

  @ApiProperty({ description: "Migration guidance.", example: "Use GET /api/notifications or the SSE stream instead." })
  message!: string;
}
