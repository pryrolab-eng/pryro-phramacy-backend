import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash } from "node:crypto";
import type { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";

export const PLATFORM_API_KEY_REQUEST_KEY = "platformApiKey";
export const REQUIRED_PERMISSION_KEY = "requiredPermission";

export const RequiredPermission = (permission: string) => SetMetadata(REQUIRED_PERMISSION_KEY, permission);

export type PlatformApiKeyContext = {
  id: string;
  name: string;
  permissions: string[];
};

function hashApiKeySecret(secret: string): string {
  return `sha256:${createHash("sha256").update(secret, "utf-8").digest("hex")}`;
}

function isHashed(value: string): boolean {
  return value.startsWith("sha256:");
}

@Injectable()
export class PlatformApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const requiredPermission = this.reflector.getAllAndOverride<string>(REQUIRED_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException({
        error: "unauthorized",
        message: "A valid platform API key is required. Use Authorization: Bearer <key> or X-Pryrox-Api-Key.",
      });
    }

    const key = await this.resolvePlatformApiKey(token);
    if (!key) {
      throw new UnauthorizedException({ error: "unauthorized", message: "Invalid or expired API key." });
    }

    if (requiredPermission && !this.hasPermission(key, requiredPermission)) {
      throw new ForbiddenException({
        error: "forbidden",
        message: `This API key does not have the "${requiredPermission}" permission.`,
      });
    }

    (request as unknown as Record<string, unknown>)[PLATFORM_API_KEY_REQUEST_KEY] = key;
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers["x-pryrox-api-key"];
    if (header) return Array.isArray(header) ? header[0] : header;

    const auth = request.headers["authorization"];
    if (!auth) return null;

    const value = Array.isArray(auth) ? auth[0] : auth;
    const match = value.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || null;
  }

  private async resolvePlatformApiKey(token: string): Promise<PlatformApiKeyContext | null> {
    if (!token || token.length < 8) return null;
    const tokenHash = hashApiKeySecret(token);

    const row = await this.prisma.api_keys.findFirst({
      where: {
        pharmacy_id: null,
        is_active: true,
        OR: [{ key_hash: tokenHash }, { key_hash: token }],
        AND: [{ OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }] }],
      },
      select: { id: true, name: true, key_hash: true, permissions: true },
    });

    if (!row) return null;

    if (!isHashed(row.key_hash)) {
      await this.prisma.api_keys
        .update({ where: { id: row.id }, data: { key_hash: tokenHash, last_used_at: new Date() } })
        .catch(() => undefined);
    } else {
      await this.prisma.api_keys
        .update({ where: { id: row.id }, data: { last_used_at: new Date() } })
        .catch(() => undefined);
    }

    return { id: row.id, name: row.name, permissions: row.permissions ?? [] };
  }

  private hasPermission(ctx: PlatformApiKeyContext, permission: string): boolean {
    if (ctx.permissions.length === 0) return true;
    return ctx.permissions.includes(permission) || ctx.permissions.includes("*");
  }
}

export function extractPlatformApiKey(request: Request): PlatformApiKeyContext | null {
  return (request as unknown as Record<string, unknown>)[PLATFORM_API_KEY_REQUEST_KEY] as PlatformApiKeyContext | null;
}
