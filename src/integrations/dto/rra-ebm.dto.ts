import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class EbmLineItemDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsNumber() @Min(1) quantity!: number;
  @ApiProperty() @IsNumber() @Min(0) price!: number;
}

export class EbmSubmissionDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() invoice?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() receiptNumber?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() saleId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() customerName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() paymentMethod?: string;
  @ApiProperty({ type: [EbmLineItemDto], required: false }) @IsOptional() @IsArray() items?: EbmLineItemDto[];
}

export class EbmSubmissionResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty() submission!: Record<string, unknown>;
}
