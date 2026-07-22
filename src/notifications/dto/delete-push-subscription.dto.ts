import { ApiProperty } from "@nestjs/swagger";

export class DeletePushSubscriptionDto {
  @ApiProperty({ description: "Exact push service endpoint to delete.", example: "https://fcm.googleapis.com/fcm/send/eXaMpLeToken", format: "uri" })
  endpoint!: string;
}
