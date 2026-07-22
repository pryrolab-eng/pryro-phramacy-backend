import { Body, Controller, Get, HttpException, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ErrorResponseDto } from "../common/dto";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/models";
import { SessionGuard } from "../auth/session.guard";
import { CreatePharmacyDto, CreatePharmacyResponseDto, OnboardingStatusResponseDto } from "./dto";
import { OnboardingService } from "./onboarding.service";

@ApiTags("Onboarding")
@Controller("onboarding")
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}

  @Get("status")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Get current onboarding step for authenticated user" })
  @ApiOkResponse({ type: OnboardingStatusResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async getStatus(@CurrentUser() user: AuthUser) {
    try {
      return await this.service.getStatus(user.id);
    } catch (error) {
      throw new HttpException({ error: "Failed to resolve onboarding status" }, 500);
    }
  }

  @Post("pharmacy")
  @UseGuards(SessionGuard)
  @ApiCookieAuth("pryrox_session")
  @ApiOperation({ summary: "Create a new pharmacy tenant during onboarding" })
  @ApiOkResponse({ type: CreatePharmacyResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async createPharmacy(@CurrentUser() user: AuthUser, @Body() body: CreatePharmacyDto) {
    try {
      const name = body.name?.trim();
      const phone = body.phone?.trim();
      if (!name || !phone) {
        throw new HttpException({ error: "Pharmacy name and phone are required." }, 400);
      }
      return await this.service.createPharmacy(user.id, {
        name,
        licenseNumber: (body.license_number?.trim() || `LIC-${Date.now()}`).slice(0, 200),
        city: body.city?.trim() || "Kigali",
        address: body.address?.trim() || null,
        phone,
        email: body.email?.trim() || user.email || "",
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error && typeof error === "object" && "status" in error) {
        const e = error as { status: number; error: string; code?: string };
        throw new HttpException({ error: e.error, code: e.code }, e.status);
      }
      const message = error instanceof Error ? error.message : "Unexpected error";
      throw new HttpException({ error: message }, 500);
    }
  }
}
