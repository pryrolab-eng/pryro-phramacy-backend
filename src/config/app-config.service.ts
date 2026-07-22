import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "./env.schema";
import {
  resolveCorsOrigins,
  sessionCookieName,
} from "./env.schema";

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get port(): number {
    return this.config.get("PORT", { infer: true });
  }

  get nodeEnv(): string {
    return this.config.get("NODE_ENV", { infer: true });
  }

  get databaseUrl(): string {
    return this.config.get("DATABASE_URL", { infer: true });
  }

  get authSecret(): string {
    return this.config.get("AUTH_SECRET", { infer: true });
  }

  get nativeAuthEnabled(): boolean {
    return this.config.get("NATIVE_AUTH_ENABLED", { infer: true });
  }

  get corsOrigins(): string[] {
    return resolveCorsOrigins({
      CORS_ORIGINS: this.config.get("CORS_ORIGINS", { infer: true }),
      NEXT_PUBLIC_APP_URL: this.config.get("NEXT_PUBLIC_APP_URL", {
        infer: true,
      }),
    });
  }

  get sessionCookieName(): string {
    return sessionCookieName(this.nodeEnv);
  }
}
