import { Body, Controller, Get, HttpException, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { ErrorResponseDto } from "../common/dto";
import { AuthService } from "./auth.service";
import { AuthMeResponseDto, InternalServerErrorDto } from "./dto";
import {
  BootstrapResponseDto, ChangeEmailDto, ChangeEmailResponseDto, ChangePasswordDto,
  ChangePasswordResponseDto, HomeResponseDto, RecoveryEmailDto, RecoveryEmailResponseDto,
  ResendConfirmationDto, SignInDto, SignInResponseDto,
  Verify2faDto, Verify2faResponseDto,
} from "./dto/auth-requests.dto";
import { CurrentUser } from "./current-user.decorator";
import type { AuthUser } from "./models";
import { SessionGuard } from "./session.guard";

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("sign-in")
  @HttpCode(200)
  @ApiOperation({ summary: "Sign in with email and password" })
  @ApiBody({ type: SignInDto })
  @ApiOkResponse({ type: SignInResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async signIn(@Body() body: SignInDto) {
    try {
      const result = await this.authService.signIn(body.email, body.password);
      if (!result.success) {
        throw new HttpException({ error: result.error }, result.unconfirmed ? 403 : 401);
      }
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Sign-in failed" }, 500);
    }
  }

  @Get("me")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Get the authenticated user" })
  @ApiOkResponse({ type: AuthMeResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 500, type: InternalServerErrorDto })
  getMe(@CurrentUser() user: AuthUser) {
    return { user };
  }

  @Get("bootstrap")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Post-login warm cache: home path + destination data" })
  @ApiOkResponse({ type: BootstrapResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async bootstrap(@CurrentUser() user: AuthUser) {
    try {
      return await this.authService.bootstrap(user);
    } catch (error) {
      throw new HttpException({ ok: false, reason: "bootstrap_failed" }, 500);
    }
  }

  @Get("home")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Resolve post-login destination path" })
  @ApiOkResponse({ type: HomeResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async home(@CurrentUser() user: AuthUser) {
    try {
      return await this.authService.home(user);
    } catch (error) {
      throw new HttpException({ ok: false, reason: "unauthenticated" }, 401);
    }
  }

  @Post("change-password")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Change password for authenticated user" })
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({ type: ChangePasswordResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async changePassword(@CurrentUser() user: AuthUser, @Body() body: ChangePasswordDto) {
    try {
      return await this.authService.changePassword(user, body);
    } catch (error) {
      if (error && typeof error === "object" && "status" in error) {
        const e = error as { status: number; error: string };
        throw new HttpException({ error: e.error }, e.status);
      }
      throw new HttpException({ error: "Failed to update password" }, 500);
    }
  }

  @Post("change-email")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Initiate email change for authenticated user" })
  @ApiBody({ type: ChangeEmailDto })
  @ApiOkResponse({ type: ChangeEmailResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async changeEmail(@CurrentUser() user: AuthUser, @Body() body: ChangeEmailDto) {
    try {
      return await this.authService.changeEmail(user, body.newEmail);
    } catch (error) {
      throw new HttpException({ error: "Failed to process email change" }, 500);
    }
  }

  @Post("verify-2fa")
  @ApiOperation({ summary: "Verify a 2FA token (TOTP or backup code) during pre-session flow" })
  @ApiBody({ type: Verify2faDto })
  @ApiOkResponse({ type: Verify2faResponseDto })
  async verify2fa(@Body() body: Verify2faDto) {
    try {
      return await this.authService.verify2fa(body);
    } catch (error) {
      if (error && typeof error === "object" && "status" in error) {
        const e = error as { status: number; error: string };
        throw new HttpException({ error: e.error }, e.status);
      }
      throw new HttpException({ error: "Verification failed" }, 500);
    }
  }

  @Post("recovery-email")
  @ApiOperation({ summary: "Send password recovery email" })
  @ApiBody({ type: RecoveryEmailDto })
  @ApiOkResponse({ type: RecoveryEmailResponseDto })
  async recoveryEmail(@Body() body: RecoveryEmailDto) {
    try {
      return await this.authService.recoveryEmail(body.email);
    } catch (error) {
      throw new HttpException({ error: "Failed to send recovery email" }, 500);
    }
  }

  @Post("resend-confirmation")
  @ApiOperation({ summary: "Resend email confirmation link" })
  @ApiBody({ type: ResendConfirmationDto })
  @ApiOkResponse({ type: ResendConfirmationDto })
  async resendConfirmation(@Body() body: ResendConfirmationDto) {
    try {
      return await this.authService.resendConfirmation(body.email);
    } catch (error) {
      throw new HttpException({ error: "Failed to resend confirmation" }, 500);
    }
  }
}
