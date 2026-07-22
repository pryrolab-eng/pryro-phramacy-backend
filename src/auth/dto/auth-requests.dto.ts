import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNumber, IsOptional, IsString, MinLength } from "class-validator";

export class BootstrapResponseDto {
  @ApiProperty() ok!: boolean;
  @ApiProperty() path!: string;
  @ApiProperty() mustChangePassword!: boolean;
  @ApiProperty() me!: Record<string, unknown>;
  @ApiProperty({ nullable: true }) entitlements: unknown = null;
  @ApiProperty({ nullable: true }) dashboard: unknown = null;
  @ApiProperty({ nullable: true }) subscription: unknown = null;
  @ApiProperty({ nullable: true }) plans: unknown = null;
  @ApiProperty({ nullable: true }) staff: unknown = null;
}

export class HomeResponseDto {
  @ApiProperty() ok!: boolean;
  @ApiProperty() path!: string;
  @ApiProperty() mustChangePassword!: boolean;
}

export class ChangePasswordDto {
  @ApiProperty() @IsString() newPassword!: string;
  @ApiProperty() @IsString() confirmPassword!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() currentPassword?: string;
}

export class ChangePasswordResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty() mustChangePassword!: boolean;
}

export class ChangeEmailDto {
  @ApiProperty() @IsEmail() newEmail!: string;
}

export class ChangeEmailResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty() message!: string;
}

export class Verify2faDto {
  @ApiProperty() @IsString() sessionToken!: string;
  @ApiProperty() @IsString() token!: string;
}

export class Verify2faResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty() userId!: string;
}

export class RecoveryEmailDto {
  @ApiProperty() @IsEmail() email!: string;
}

export class RecoveryEmailResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty() provider?: string;
  @ApiProperty() message!: string;
}

export class ResendConfirmationDto {
  @ApiProperty() @IsEmail() email!: string;
}

export class SignInDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MinLength(1) password!: string;
}

export class SignInResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty({ required: false }) needsTwoFactor?: boolean;
  @ApiProperty({ required: false }) sessionToken?: string;
  @ApiProperty({ required: false }) userId?: string;
  @ApiProperty({ required: false }) error?: string;
}

