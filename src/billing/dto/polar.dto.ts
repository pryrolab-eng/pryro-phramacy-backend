import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class PolarConfigDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty() server!: string;
}

export class CreateCheckoutDto {
  @ApiProperty() planId!: string;
  @ApiProperty() subscriptionId!: string;
  @ApiPropertyOptional() returnContext?: string;
  @ApiPropertyOptional() customerEmail?: string;
  @ApiPropertyOptional() customerName?: string;
  @ApiPropertyOptional() customerPhone?: string;
}

export class CheckoutResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty() checkoutUrl!: string;
  @ApiProperty() checkoutId!: string;
  @ApiProperty() transactionId!: string;
}
