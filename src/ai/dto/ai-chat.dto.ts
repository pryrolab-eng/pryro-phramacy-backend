import { IsArray, IsIn, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AiMessageDto {
  @ApiProperty()
  @IsString()
  role!: string;

  @ApiProperty()
  @IsString()
  content!: string;
}

export class AiChatDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  threadId?: string;

  @ApiProperty({ type: [AiMessageDto] })
  @IsArray()
  messages!: AiMessageDto[];

  @ApiProperty({ enum: ["pharmacy", "platform_admin"] })
  @IsIn(["pharmacy", "platform_admin"])
  scope!: "pharmacy" | "platform_admin";

  @ApiPropertyOptional()
  @IsOptional()
  pageContext?: Record<string, unknown>;
}

export class CreateThreadDto {
  @ApiProperty()
  @IsString()
  scope!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;
}

export class AiSafetyCheckDto {
  @ApiProperty({ type: "array", items: { type: "object" } })
  @IsArray()
  items!: Array<{ name?: string; quantity?: number }>;
}
