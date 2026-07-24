import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class PolarConfigDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty() server!: string;
}

export class CreateCheckoutDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  planId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subscriptionId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  returnContext?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerPhone?: string;
}

export class CheckoutResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty() checkoutUrl!: string;
  @ApiProperty() checkoutId!: string;
  @ApiProperty() transactionId!: string;
}
