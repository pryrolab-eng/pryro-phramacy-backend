import { Injectable } from "@nestjs/common";
import { jwtVerify } from "jose";
import { AppConfigService } from "../config/app-config.service";
import type { SessionJwtPayload } from "./auth.types";

@Injectable()
export class SessionTokenService {
  constructor(private readonly appConfig: AppConfigService) {}

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
}
