import {
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  NotFoundException,
  Param,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { AUTH_USER_REQUEST_KEY, type AuthUser } from "../auth/auth.types";
import { SessionGuard } from "../auth/session.guard";
import { ErrorResponseDto } from "../common/dto";
import { PrismaService } from "../prisma/prisma.service";
import {
  StorageService,
  UPLOAD_CATEGORIES,
  type UploadCategory,
} from "../storage/storage.service";

@ApiTags("Files")
@Controller()
export class FilesController {
  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("files/:category/*filePath")
  @ApiOperation({ summary: "Serve an uploaded file from local storage" })
  @ApiResponse({ status: 200, description: "File content" })
  @ApiResponse({ status: 404, type: ErrorResponseDto, description: "File not found" })
  @ApiResponse({ status: 401, type: ErrorResponseDto, description: "Unauthorized" })
  @ApiResponse({ status: 403, type: ErrorResponseDto, description: "Forbidden" })
  async getFile(
    @Param("category") category: string,
    @Param("filePath") filePath: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const cat = category as UploadCategory;
    if (
      cat !== UPLOAD_CATEGORIES.pharmacyLogos &&
      cat !== UPLOAD_CATEGORIES.platformReports &&
      cat !== UPLOAD_CATEGORIES.pharmacyFiles
    ) {
      throw new NotFoundException({ error: "Not found" });
    }

    const objectPath = filePath.split("/").map(decodeURIComponent).join("/");
    if (!objectPath || objectPath.includes("..")) {
      throw new NotFoundException({ error: "Not found" });
    }

    if (cat === UPLOAD_CATEGORIES.platformReports) {
      const user: AuthUser | undefined = (
        req as Request & { [AUTH_USER_REQUEST_KEY]?: AuthUser }
      )[AUTH_USER_REQUEST_KEY];
      if (!user) throw new UnauthorizedException({ error: "Unauthorized" });
      const profile = await this.prisma.public_users.findUnique({
        where: { id: user.id },
        select: { is_platform_admin: true },
      });
      if (!profile?.is_platform_admin) {
        throw new ForbiddenException({ error: "Forbidden" });
      }
    }

    if (cat === UPLOAD_CATEGORIES.pharmacyFiles) {
      const user: AuthUser | undefined = (
        req as Request & { [AUTH_USER_REQUEST_KEY]?: AuthUser }
      )[AUTH_USER_REQUEST_KEY];
      if (!user) throw new UnauthorizedException({ error: "Unauthorized" });
      const activeUser = await this.prisma.public_users.findUnique({
        where: { id: user.id },
        select: { active_pharmacy_id: true },
      });
      if (!objectPath.startsWith(`${activeUser?.active_pharmacy_id}/`)) {
        throw new NotFoundException({ error: "Not found" });
      }
    }

    try {
      const buffer = await this.storage.read(cat, objectPath);
      const contentType = this.storage.getMimeType(objectPath);
      const cacheControl =
        cat === UPLOAD_CATEGORIES.pharmacyLogos
          ? "public, max-age=86400"
          : "private, no-store";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", cacheControl);
      res.send(buffer);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        throw new NotFoundException({ error: "Not found" });
      }
      throw new HttpException({ error: "Failed to read file" }, 500);
    }
  }
}
