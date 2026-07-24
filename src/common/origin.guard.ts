import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import { AppConfigService } from "../config/app-config.service";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!MUTATING.has(request.method.toUpperCase())) {
      return true;
    }

    const origin = request.headers.origin?.trim();
    const referer = request.headers.referer?.trim();

    // Browser requests always send either Origin (cross-origin) or Referer (same-origin).
    // If neither is present, the request is likely from a non-browser tool exploiting cookies.
    if (!origin && !referer) {
      throw new ForbiddenException({ error: "Missing origin and referer headers" });
    }

    if (origin) {
      const allowed = new Set(this.config.corsOrigins);
      if (!allowed.has(origin)) {
        throw new ForbiddenException({ error: "Invalid origin" });
      }
    }

    return true;
  }
}
