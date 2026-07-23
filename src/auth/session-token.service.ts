import { Injectable } from "@nestjs/common";
import { SignJWT, jwtVerify } from "jose";
import crypto from "crypto";
import { AppConfigService } from "../config/app-config.service";
import { PrismaService } from "../prisma/prisma.service";
import type { SessionJwtPayload } from "./auth.types";

export const ACCESS_SESSION_TTL_MS = 60 * 60 * 1000;
export const REFRESH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class SessionTokenService {
  constructor(
    private readonly appConfig: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private getSecret(): Uint8Array {
    return new TextEncoder().encode(this.appConfig.authSecret);
  }

  async verifyAccessToken(token: string): Promise<SessionJwtPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.getSecret());
      const sub = payload.sub;
      const sid = payload.sid;
      if (!sub || typeof sub !== "string" || !sid || typeof sid !== "string") {
        return null;
      }
      return { sub, sid };
    } catch {
      return null;
    }
  }

  async signAccessToken(userId: string, sessionId: string, expiresAt: Date): Promise<string> {
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .setIssuedAt()
      .sign(this.getSecret());
  }

  async signRefreshToken(userId: string, sessionId: string, expiresAt: Date): Promise<string> {
    return new SignJWT({ sid: sessionId, typ: "refresh" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .setIssuedAt()
      .sign(this.getSecret());
  }

  async createSession(userId: string, userAgent?: string, ip?: string): Promise<{ accessJwt: string; refreshJwt: string; sessionId: string }> {
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const accessExpires = new Date(Date.now() + ACCESS_SESSION_TTL_MS);
    const refreshExpires = new Date(Date.now() + REFRESH_SESSION_TTL_MS);

    const session = await this.prisma.app_sessions.create({
      data: {
        user_id: userId,
        token_hash: tokenHash,
        expires_at: refreshExpires,
        user_agent: userAgent ?? null,
        ip: ip ?? null,
      },
    });

    const accessJwt = await this.signAccessToken(userId, session.id, accessExpires);
    const refreshJwt = await this.signRefreshToken(userId, session.id, refreshExpires);

    return { accessJwt, refreshJwt, sessionId: session.id };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.app_sessions.delete({ where: { id: sessionId } }).catch(() => {});
  }

  async revokeSessionByToken(accessJwt: string): Promise<void> {
    const payload = await this.verifyAccessToken(accessJwt);
    if (payload?.sid) {
      await this.revokeSession(payload.sid);
    }
  }
}
