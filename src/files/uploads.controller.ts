import {
  Controller,
  HttpException,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { AUTH_USER_REQUEST_KEY, type AuthUser } from "../auth/auth.types";
import { SessionGuard } from "../auth/session.guard";
import { ErrorResponseDto } from "../common/dto";
import { TenantContextService } from "../tenant/tenant-context.service";
import { StorageService, UPLOAD_CATEGORIES } from "../storage/storage.service";
import { CloudinaryStorageService } from "../storage/cloudinary-storage.service";
import { PrismaService } from "../prisma/prisma.service";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function sanitizeFilename(name: string): string {
  const trimmed = name.trim() || "upload";
  const parts = trimmed.split(".");
  const ext = parts.length > 1 ? `.${parts.pop()}` : "";
  const base = parts.join(".") || trimmed;
  const safeBase = base.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-|-$/g, "") || "upload";
  const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "");
  return `${safeBase}${safeExt}`;
}

@ApiTags("Files")
@Controller()
export class UploadsController {
  constructor(
    private readonly storage: StorageService,
    private readonly tenantContext: TenantContextService,
    private readonly cloudinary: CloudinaryStorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("uploads")
  @UseGuards(SessionGuard)
  @UseInterceptors(FileInterceptor("file"))
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Upload a file for the active pharmacy" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "binary",
          description: "File to upload (max 10 MB)",
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: "Upload succeeded" })
  @ApiResponse({ status: 400, type: ErrorResponseDto, description: "No file uploaded" })
  @ApiResponse({ status: 413, type: ErrorResponseDto, description: "File too large" })
  @ApiResponse({ status: 401, type: ErrorResponseDto, description: "Unauthorized" })
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_UPLOAD_BYTES })],
        fileIsRequired: true,
      }),
    )
    file: { buffer: Buffer; mimetype: string; originalname: string },
    @Req() req: Request,
  ) {
    const user: AuthUser = (req as Request & { [AUTH_USER_REQUEST_KEY]: AuthUser })[
      AUTH_USER_REQUEST_KEY
    ];

    const pharmacyId = await this.tenantContext.requirePharmacyId(user.id);
    const filename = sanitizeFilename(file.originalname);
    const objectPath = `${pharmacyId}/uploads/${Date.now()}-${filename}`;

    await this.storage.save({
      category: UPLOAD_CATEGORIES.pharmacyFiles,
      objectPath,
      buffer: file.buffer,
    });

    return {
      success: true,
      upload: {
        id: objectPath,
        filename,
        size: file.buffer.length,
        type: file.mimetype || "application/octet-stream",
        url: this.storage.getUrl(UPLOAD_CATEGORIES.pharmacyFiles, objectPath),
        uploadedAt: new Date().toISOString(),
      },
    };
  }

  @Post("uploads/logo")
  @UseGuards(SessionGuard)
  @UseInterceptors(FileInterceptor("file"))
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({
    summary: "Upload pharmacy logo",
    description:
      "Uploads the pharmacy logo. Uses Cloudinary CDN when configured, otherwise stores locally. Saves the URL to pharmacies.logo_url.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary", description: "Image file (max 5 MB)" },
      },
    },
  })
  @ApiResponse({ status: 201, description: "Logo uploaded and saved" })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async uploadLogo(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 })],
        fileIsRequired: true,
      }),
    )
    file: { buffer: Buffer; mimetype: string; originalname: string },
    @Req() req: Request,
  ) {
    const user: AuthUser = (req as Request & { [AUTH_USER_REQUEST_KEY]: AuthUser })[
      AUTH_USER_REQUEST_KEY
    ];

    const pharmacyId = await this.tenantContext.requirePharmacyId(user.id);

    if (!file.mimetype.startsWith("image/")) {
      throw new HttpException({ error: "Only image files are allowed" }, 400);
    }

    let logoUrl: string;

    if (this.cloudinary.isReady()) {
      // Upload to Cloudinary CDN
      logoUrl = await this.cloudinary.uploadLogo(file.buffer, pharmacyId, file.mimetype);
    } else {
      // Fall back to local storage
      const ext = file.originalname.split(".").pop() ?? "jpg";
      const objectPath = `${pharmacyId}/logo.${ext}`;
      await this.storage.save({
        category: UPLOAD_CATEGORIES.pharmacyLogos,
        objectPath,
        buffer: file.buffer,
      });
      logoUrl = this.storage.getUrl(UPLOAD_CATEGORIES.pharmacyLogos, objectPath);
    }

    // Persist the URL on the pharmacy record
    await this.prisma.pharmacies.update({
      where: { id: pharmacyId },
      data: { logo_url: logoUrl, updated_at: new Date() },
    });

    return { success: true, logoUrl };
  }
}
