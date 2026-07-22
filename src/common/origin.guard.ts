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
    if (!origin) {
      return true;
    }

    const allowed = new Set(this.config.corsOrigins);
    if (!allowed.has(origin)) {
      throw new ForbiddenException({ error: "Invalid origin" });
    }
    return true;
  }
}
