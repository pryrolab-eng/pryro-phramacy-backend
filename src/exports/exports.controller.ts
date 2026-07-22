import {
  Body,
  Controller,
  HttpException,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { ErrorResponseDto } from "../common/dto";
import { TenantContextService } from "../tenant/tenant-context.service";
import { CreateExportDto, ExportResultDto } from "./dto";
import { ExportsService } from "./exports.service";

@ApiTags("Exports")
@ApiCookieAuth("pryrox_session")
@UseGuards(SessionGuard)
@Controller("exports")
export class ExportsController {
  constructor(
    private readonly service: ExportsService,
    private readonly tenant: TenantContextService,
  ) {}

  @Post()
  @ApiOperation({ summary: "Export pharmacy data as CSV or JSON" })
  @ApiBody({ type: CreateExportDto })
  @ApiOkResponse({ type: ExportResultDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async export(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateExportDto,
  ) {
    try {
      const pharmacyId = await this.tenant.requirePharmacyId(user.id);
      const type = body.type === "customers" || body.type === "inventory" ? body.type : "sales";
      const format = body.format === "json" ? "json" : "csv";
      const rows = await this.service.loadRows(pharmacyId, type);
      const date = new Date().toISOString().slice(0, 10);
      const filename = `${fileSafe(type)}-export-${date}.${format}`;
      const objectPath = `${pharmacyId}/exports/${Date.now()}-${filename}`;
      const content = this.service.generateContent(rows, format);
      const size = Buffer.byteLength(content, "utf8");

      const downloadUrl = `/api/files/${objectPath}`;

      return {
        success: true,
        export: {
          id: objectPath,
          type,
          format,
          filename,
          size: `${size} bytes`,
          rowCount: rows.length,
          downloadUrl,
          createdAt: new Date().toISOString(),
          status: "ready",
        },
      };
    } catch (error) {
      console.error("POST /api/exports", error);
      throw new HttpException({ error: "Export failed" }, 500);
    }
  }
}

function fileSafe(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");
}
