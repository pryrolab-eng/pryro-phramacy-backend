import { IsOptional, IsString } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class ValidateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cardNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expiryMonth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expiryYear?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cvv?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  holderName?: string;
}
