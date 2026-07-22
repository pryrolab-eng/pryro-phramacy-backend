import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { BrandingService } from "./branding.service";

@ApiTags("Branding")
@Controller("branding")
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  /** Public — no auth required. Returns platform name, logo, and support email. */
  @Get()
  @ApiOperation({ summary: "Get public platform branding" })
  getPublicBranding() {
    return this.branding.getPublicBranding();
  }
}
