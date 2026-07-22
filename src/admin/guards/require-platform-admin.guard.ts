import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { AUTH_USER_REQUEST_KEY, type AuthUser } from "../../auth/auth.types";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class RequirePlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user: AuthUser | undefined = (
      request as Request & { [AUTH_USER_REQUEST_KEY]?: AuthUser }
    )[AUTH_USER_REQUEST_KEY];
    if (!user) {
      throw new UnauthorizedException({ error: "Unauthorized" });
    }
    const profile = await this.prisma.public_users.findUnique({
      where: { id: user.id },
      select: { is_platform_admin: true },
    });
    if (!profile?.is_platform_admin) {
      throw new ForbiddenException({ error: "Forbidden" });
    }
    return true;
  }
}
