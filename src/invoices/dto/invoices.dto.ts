import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class BillingHistoryRowDto {
  @ApiProperty() id!: string;
  @ApiProperty() date!: string;
  @ApiProperty() amount!: number;
  @ApiProperty() status!: string;
  @ApiProperty() planName!: string;
  @ApiProperty() provider!: string;
  @ApiPropertyOptional() invoiceNumber?: string;
  @ApiProperty() source!: string;
}

export class BillingHistoryResponseDto {
  @ApiProperty({ type: [BillingHistoryRowDto] })
  history!: BillingHistoryRowDto[];

  @ApiPropertyOptional()
  nextPendingDueDate?: string | null;

  @ApiPropertyOptional()
  nextPendingAmount?: number | null;

  @ApiPropertyOptional()
  activeExpiresAt?: string | null;

  @ApiPropertyOptional()
  activePaymentMethod?: string | null;

  @ApiPropertyOptional()
  defaultPaymentMethodType?: string | null;
}
