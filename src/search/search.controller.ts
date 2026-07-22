import { Controller, Get, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { SearchResponseDto } from "./dto";
import { SearchService } from "./search.service";

const EMPTY = {
  customers: [],
  products: [],
  prescriptions: [],
  sales: [],
  staff: [],
  branches: [],
};

@ApiTags("Search")
@Controller("search")
export class SearchController {
  constructor(
    private readonly auth: AuthService,
    private readonly service: SearchService,
    private readonly tenant: TenantContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Search pharmacy records", description: "Soft-authenticated cross-domain search over customers, products, prescriptions, completed sales, staff, and branches. Queries shorter than two usable characters and unauthenticated requests return empty result groups." })
  @ApiQuery({ name: "q", required: false, type: String, description: "Search text. At least two characters must remain after reserved punctuation is removed.", example: "amoxicillin" })
  @ApiResponse({ status: 200, description: "Grouped search results were returned. Each group contains at most six matches; internal failures return empty arrays.", type: SearchResponseDto })
  @ApiResponse({ status: 500, description: "Search failures are normalized to an empty successful response.", type: SearchResponseDto })
  async get(@Req() request: Request, @Query("q") query?: string) {
    try {
      const raw = query?.trim() ?? "";
      if (raw.length < 2) return EMPTY;
      const pattern = raw.replace(/[%_,()]/g, " ").trim();
      if (pattern.length < 2) return EMPTY;
      const user = await this.auth.resolveUserFromRequest(request);
      if (!user) return EMPTY;
      return await this.service.search(await this.tenant.requirePharmacyId(user.id), pattern);
    } catch (error) {
      console.error("GET /api/search", error);
      return EMPTY;
    }
  }
}
