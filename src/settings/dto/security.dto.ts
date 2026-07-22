import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class SecuritySettingsDto {
  @ApiProperty({ default: false })
  ip_whitelist_enabled!: boolean;
}

export class UpdateSecuritySettingsDto {
  @ApiPropertyOptional()
  ip_whitelist_enabled?: boolean;
}

export class TwoFactorStatusDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty() platformAllowsTwoFactor!: boolean;
}

export class TwoFactorToggleDto {
  @ApiProperty() enabled!: boolean;
}

export class TwoFactorSetupDto {
  @ApiProperty() secret!: string;
  @ApiProperty() qrCode!: string;
  @ApiProperty({ type: [String] }) backupCodes!: string[];
}

export class TwoFactorVerifyDto {
  @ApiProperty() token!: string;
}

export class IpWhitelistToggleDto {
  @ApiProperty() enabled!: boolean;
}

export class AddIpWhitelistDto {
  @ApiProperty() ip!: string;
  @ApiPropertyOptional() description?: string;
}

export class DeleteIpWhitelistDto {
  @ApiProperty() id!: string;
}

export class IpWhitelistEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty() ip_address!: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiPropertyOptional() is_active?: boolean | null;
  @ApiPropertyOptional() created_at?: Date | null;
}

export class IpWhitelistListDto {
  @ApiProperty({ type: [IpWhitelistEntryDto] })
  ips!: IpWhitelistEntryDto[];
}
