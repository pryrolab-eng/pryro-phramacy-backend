import { Injectable } from "@nestjs/common";
import { SignJWT, jwtVerify } from "jose";
import { AppConfigService } from "../config/app-config.service";

type TokenPurpose = "password_reset" | "email_confirm" | "email_change";

@Injectable()
export class AuthTokensService {
  constructor(private readonly appConfig: AppConfigService) {}

  private getSecret(): Uint8Array {
    return new TextEncoder().encode(this.appConfig.authSecret);
  }

  private async sign(
    purpose: TokenPurpose,
    userId: string,
    ttlMs: number,
    extra?: Record<string, string>,
  ): Promise<string> {
    return new SignJWT({ purpose, ...extra })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setExpirationTime(Math.floor((Date.now() + ttlMs) / 1000))
      .setIssuedAt()
      .sign(this.getSecret());
  }

  private async verify(
    token: string,
    expectedPurpose: TokenPurpose,
  ): Promise<{ userId: string; email?: string } | null> {
    try {
      const { payload } = await jwtVerify(token, this.getSecret());
      if (payload["purpose"] !== expectedPurpose || !payload.sub) return null;
      return {
        userId: payload.sub,
        email: typeof payload["email"] === "string" ? payload["email"] : undefined,
      };
    } catch {
      return null;
    }
  }

  signPasswordResetToken(userId: string): Promise<string> {
    return this.sign("password_reset", userId, 60 * 60 * 1000);
  }

  verifyPasswordResetToken(token: string): Promise<{ userId: string } | null> {
    return this.verify(token, "password_reset").then((r) =>
      r ? { userId: r.userId } : null,
    );
  }

  signEmailConfirmToken(userId: string, email: string): Promise<string> {
    return this.sign("email_confirm", userId, 24 * 60 * 60 * 1000, { email });
  }

  async verifyEmailConfirmToken(token: string): Promise<{ userId: string; email?: string } | null> {
    return this.verify(token, "email_confirm");
  }

  signEmailChangeToken(userId: string, newEmail: string): Promise<string> {
    return this.sign("email_change", userId, 60 * 60 * 1000, { email: newEmail });
  }

  async verifyEmailChangeToken(token: string): Promise<{ userId: string; newEmail: string } | null> {
    const result = await this.verify(token, "email_change");
    if (!result?.email) return null;
    return { userId: result.userId, newEmail: result.email };
  }

  /** Build the app base URL (NestJS uses APP_URL, fallback to Next public URL) */
  getAppUrl(): string {
    return (
      process.env["APP_URL"] ??
      process.env["NEXT_PUBLIC_APP_URL"] ??
      "http://localhost:3000"
    ).replace(/\/$/, "");
  }
}
