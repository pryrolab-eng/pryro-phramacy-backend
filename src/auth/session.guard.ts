import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { AUTH_USER_REQUEST_KEY, type AuthUser } from "./auth.types";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = await this.authService.resolveUserFromRequest(request);
    if (!user) {
      throw new UnauthorizedException({ error: "Unauthorized" });
    }
    (request as Request & { [AUTH_USER_REQUEST_KEY]: AuthUser })[
      AUTH_USER_REQUEST_KEY
    ] = user;
    return true;
  }
}
