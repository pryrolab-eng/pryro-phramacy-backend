import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class PushSubscriptionKeysDto {
  @ApiProperty({ description: "Base64url-encoded P-256 ECDH public key.", example: "BOr6mS9YwV8sVn1vM0pQm8Jf3G9Zx2D4k7L1a5N8cQ0" })
  p256dh!: string;

  @ApiProperty({ description: "Base64url-encoded authentication secret.", example: "n4Yq7w2R9sK1xP6b" })
  auth!: string;
}

export class SavePushSubscriptionDto {
  @ApiProperty({ description: "Unique push service endpoint.", example: "https://fcm.googleapis.com/fcm/send/eXaMpLeToken", format: "uri" })
  endpoint!: string;

  @ApiProperty({ description: "Web Push encryption keys.", type: PushSubscriptionKeysDto })
  keys!: PushSubscriptionKeysDto;

  @ApiPropertyOptional({ description: "Top-level legacy alias for `keys.p256dh`.", example: "BOr6mS9YwV8sVn1vM0pQm8Jf3G9Zx2D4k7L1a5N8cQ0" })
  p256dh?: string;

  @ApiPropertyOptional({ description: "Top-level legacy alias for `keys.auth`.", example: "n4Yq7w2R9sK1xP6b" })
  auth?: string;
}
