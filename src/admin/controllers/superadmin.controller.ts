import {
  Body, Controller, Get, HttpException, Post, UseGuards,
} from "@nestjs/common";
import {
  ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags,
} from "@nestjs/swagger";
import { SessionGuard } from "../../auth/session.guard";
import { RequirePlatformAdminGuard } from "../guards/require-platform-admin.guard";
import { AdminService } from "../admin.service";
import { SuperadminCreatePharmacyDto } from "../dto";

@ApiTags("SuperAdmin")
@ApiCookieAuth("pryrox_session")
@UseGuards(SessionGuard, RequirePlatformAdminGuard)
@Controller("superadmin")
export class SuperAdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("pharmacies")
  @ApiOperation({ summary: "List all pharmacies (raw)" })
  async listPharmacies() {
    try {
      return await this.admin.listRawPharmacies();
    } catch {
      throw new HttpException({ error: "Failed to fetch pharmacies" }, 500);
    }
  }

  @Post("pharmacies")
  @ApiOperation({ summary: "Create a pharmacy (raw)" })
  @ApiBody({ type: SuperadminCreatePharmacyDto })
  async createPharmacy(@Body() body: SuperadminCreatePharmacyDto) {
    try {
      return await this.admin.createRawPharmacy(body as unknown as Record<string, unknown>);
    } catch {
      throw new HttpException({ success: false, error: "Failed to create pharmacy" }, 500);
    }
  }

  @Get("dashboard")
  @ApiOperation({ summary: "Superadmin dashboard metrics" })
  async getDashboard() {
    try {
      return await this.admin.getSuperadminDashboard();
    } catch {
      throw new HttpException({ error: "Failed to fetch dashboard data" }, 500);
    }
  }
}
