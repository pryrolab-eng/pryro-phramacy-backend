import { Body, Controller, Get, HttpException, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { ErrorResponseDto } from "../common/dto";
import { AuthService } from "./auth.service";
import { AuthMeResponseDto, InternalServerErrorDto } from "./dto";
import {
  BootstrapResponseDto, ChangeEmailDto, ChangeEmailResponseDto, ChangePasswordDto,
  ChangePasswordResponseDto, HomeResponseDto, RecoveryEmailDto, RecoveryEmailResponseDto,
  ResendConfirmationDto, ResetPasswordDto, ResetPasswordResponseDto, SignInDto,
  SignInResponseDto, SignUpDto, SignUpResponseDto,
  Verify2faDto, Verify2faResponseDto,
} from "./dto/auth-requests.dto";
import { CurrentUser } from "./current-user.decorator";
import type { AuthUser } from "./models";
import { SessionGuard } from "./session.guard";
import { SessionTokenService } from "./session-token.service";
import { AppConfigService } from "../config/app-config.service";
import { PrismaService } from "../prisma/prisma.service";

function sessionCookieOptions(appConfig: AppConfigService, expires: Date) {
  const isProduction = appConfig.nodeEnv === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionTokens: SessionTokenService,
    private readonly appConfig: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("sign-in")
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @ApiOperation({ summary: "Sign in with email and password" })
  @ApiBody({ type: SignInDto })
  @ApiOkResponse({ type: SignInResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async signIn(@Body() body: SignInDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const result = await this.authService.signIn(body.email, body.password);
      if (!result.success) {
        throw new HttpException({ error: result.error }, result.unconfirmed ? 403 : 401);
      }

      if (result.needsTwoFactor) {
        return result;
      }

      const session = await this.sessionTokens.createSession(
        result.userId!,
        req.headers["user-agent"],
        req.ip,
      );

      const cookieName = this.appConfig.sessionCookieName;
      const refreshCookieName = this.appConfig.nodeEnv === "production"
        ? "__Secure-pryrox_refresh"
        : "pryrox_refresh";

      const accessExpires = new Date(Date.now() + 60 * 60 * 1000);
      const refreshExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      res.cookie(cookieName, session.accessJwt, sessionCookieOptions(this.appConfig, accessExpires));
      res.cookie(refreshCookieName, session.refreshJwt, sessionCookieOptions(this.appConfig, refreshExpires));

      return { success: true, userId: result.userId, accessJwt: session.accessJwt, refreshJwt: session.refreshJwt };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Sign-in failed" }, 500);
    }
  }

  @Post("sign-up")
  @UseGuards(ThrottlerGuard)
  @HttpCode(201)
  @ApiOperation({ summary: "Create a new account" })
  @ApiBody({ type: SignUpDto })
  @ApiOkResponse({ type: SignUpResponseDto })
  async signUp(@Body() body: SignUpDto) {
    try {
      const result = await this.authService.signUp(body.email, body.password, body.fullName);

      if (!result.success) {
        throw new HttpException({ error: result.error }, 400);
      }

      // Don't issue session cookies — the user must confirm their email first
      return {
        success: true,
        userId: result.userId,
        needsEmailConfirmation: true,
        message: "Account created. Please check your email to confirm your account before signing in.",
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Sign-up failed" }, 500);
    }
  }

  @Post("sign-out")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Sign out and clear session" })
  async signOut(@CurrentUser() user: AuthUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookieName = this.appConfig.sessionCookieName;
    const refreshCookieName = this.appConfig.nodeEnv === "production"
      ? "__Secure-pryrox_refresh"
      : "pryrox_refresh";

    const accessJwt = this.authService.extractSessionJwt(req);
    if (accessJwt) {
      await this.sessionTokens.revokeSessionByToken(accessJwt);
    }

    res.clearCookie(cookieName, { path: "/" });
    res.clearCookie(refreshCookieName, { path: "/" });

    return { success: true };
  }

  @Post("refresh")
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @ApiOperation({ summary: "Refresh access token using the refresh cookie" })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshCookieName = this.appConfig.nodeEnv === "production"
      ? "__Secure-pryrox_refresh"
      : "pryrox_refresh";
    const refreshJwt = req.cookies?.[refreshCookieName];

    if (!refreshJwt) {
      throw new HttpException({ error: "No refresh token" }, 401);
    }

    const payload = await this.sessionTokens.verifyRefreshToken(refreshJwt);
    if (!payload?.sid) {
      throw new HttpException({ error: "Invalid refresh token" }, 401);
    }

    const oldSession = await this.prisma.app_sessions.findUnique({ where: { id: payload.sid } });
    if (!oldSession) {
      throw new HttpException({ error: "Session revoked" }, 401);
    }

    // Rotate: revoke old session, create new one so the old refresh token can't be reused
    await this.sessionTokens.revokeSession(oldSession.id);
    const newSession = await this.sessionTokens.createSession(
      oldSession.user_id,
      oldSession.user_agent ?? undefined,
      oldSession.ip ?? undefined,
    );

    const accessExpires = new Date(Date.now() + 60 * 60 * 1000);
    const refreshExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const cookieName = this.appConfig.sessionCookieName;
    res.cookie(cookieName, newSession.accessJwt, sessionCookieOptions(this.appConfig, accessExpires));
    res.cookie(refreshCookieName, newSession.refreshJwt, sessionCookieOptions(this.appConfig, refreshExpires));

    return { success: true };
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
  async verify2fa(@Body() body: Verify2faDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const result = await this.authService.verify2fa(body);
      if (!result || !result.userId) {
        throw { status: 400, error: "Verification failed" };
      }

      const session = await this.sessionTokens.createSession(
        result.userId,
        req.headers["user-agent"],
        req.ip,
      );

      const cookieName = this.appConfig.sessionCookieName;
      const refreshCookieName = this.appConfig.nodeEnv === "production"
        ? "__Secure-pryrox_refresh"
        : "pryrox_refresh";

      const accessExpires = new Date(Date.now() + 60 * 60 * 1000);
      const refreshExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      res.cookie(cookieName, session.accessJwt, sessionCookieOptions(this.appConfig, accessExpires));
      res.cookie(refreshCookieName, session.refreshJwt, sessionCookieOptions(this.appConfig, refreshExpires));

      return { success: true, userId: result.userId, accessJwt: session.accessJwt, refreshJwt: session.refreshJwt };
    } catch (error) {
      if (error && typeof error === "object" && "status" in error) {
        const e = error as { status: number; error: string };
        throw new HttpException({ error: e.error }, e.status);
      }
      throw new HttpException({ error: "Verification failed" }, 500);
    }
  }

  @Post("reset-password")
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @ApiOperation({ summary: "Reset password using a recovery token" })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({ type: ResetPasswordResponseDto })
  async resetPassword(@Body() body: ResetPasswordDto) {
    try {
      const result = await this.authService.resetPassword(body.token, body.password);
      if (!result.success) {
        throw new HttpException({ error: result.error }, 400);
      }
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Password reset failed" }, 500);
    }
  }

  @Post("recovery-email")
  @UseGuards(ThrottlerGuard)
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
  @UseGuards(ThrottlerGuard)
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
