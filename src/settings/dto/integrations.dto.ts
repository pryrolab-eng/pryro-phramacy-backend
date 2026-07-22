import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

class SupplierSyncConfig {
  @ApiProperty() enabled!: boolean;
  @ApiProperty() provider!: string;
  @ApiProperty() endpoint!: string;
}

class SmsConfig {
  @ApiProperty() enabled!: boolean;
  @ApiProperty() provider!: string;
  @ApiProperty() senderId!: string;
}

export class IntegrationConfigDto {
  @ApiProperty() supplierSync!: SupplierSyncConfig;
  @ApiProperty() sms!: SmsConfig;
}

export class IntegrationStatusDto {
  @ApiProperty() activeSuppliers!: number;
  @ApiProperty() supplierSyncConnected!: boolean;
  @ApiProperty() smsConnected!: boolean;
}

export class IntegrationsResponseDto {
  @ApiProperty() config!: IntegrationConfigDto;
  @ApiProperty() status!: IntegrationStatusDto;
}

export class UpdateIntegrationsDto {
  @ApiPropertyOptional() supplierSync?: Partial<SupplierSyncConfig>;
  @ApiPropertyOptional() sms?: Partial<SmsConfig>;
}
