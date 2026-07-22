import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsString } from "class-validator";

export class MobileMoneyPaymentDto {
  @ApiProperty() @IsNumber() amount!: number;
  @ApiProperty() @IsString() phone!: string;
  @ApiProperty() @IsString() provider!: string;
}

export class MobileMoneyPaymentResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty() transactionId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() provider!: string;
  @ApiProperty() phone!: string;
  @ApiProperty() amount!: number;
  @ApiProperty() reference!: string;
  @ApiProperty() message!: string;
}
