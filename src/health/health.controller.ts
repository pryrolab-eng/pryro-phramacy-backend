import { Controller, Get, Header, ServiceUnavailableException } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { HttpErrorResponseDto, LivenessResponseDto, ReadinessFailureResponseDto, ReadinessResponseDto } from "./dto";
import { HealthService } from "./health.service";

@ApiTags("Health")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: "Check service liveness", description: "Public lightweight probe confirming that the API process is running. It does not check database connectivity." })
  @ApiResponse({ status: 200, description: "The API process is alive.", type: LivenessResponseDto })
  @ApiResponse({ status: 500, description: "An unexpected server failure prevented the liveness response.", type: HttpErrorResponseDto })
  getLiveness() {
    return this.healthService.liveness();
  }

  @Get("platform-config")
  @Header("Cache-Control", "public, s-maxage=60, stale-while-revalidate=30")
  @ApiOperation({
    summary: "Public platform configuration for Next.js middleware",
    description: "Returns maintenance mode status, registration toggle, and API rate limit. No auth required. Cache-Control: 60s.",
  })
  @ApiResponse({ status: 200, description: "Platform config returned.", schema: { type: "object" } })
  async platformConfig() {
    return this.healthService.platformConfig();
  }

  @Get("clickhouse")
  @ApiOperation({
    summary: "ClickHouse connectivity and performance diagnostic",
    description: "Tests ClickHouse connection, measures query latency, and shows row counts. Public endpoint.",
  })
  @ApiResponse({ status: 200, description: "ClickHouse diagnostic result.", schema: { type: "object" } })
  async clickhouseDiagnostic() {
    return this.healthService.clickhouseDiagnostic();
  }

  @Get("ready")
  @ApiOperation({ summary: "Check service readiness", description: "Public readiness probe that verifies the API can connect to its database." })
  @ApiResponse({ status: 200, description: "The API and database are ready to serve traffic.", type: ReadinessResponseDto })
  @ApiResponse({ status: 503, description: "The database is unavailable, so the API is not ready.", type: ReadinessFailureResponseDto })
  @ApiResponse({ status: 500, description: "An unexpected server failure prevented the readiness response.", type: HttpErrorResponseDto })
  async getReadiness() {
    const result = await this.healthService.readiness();
    if (result.status !== "ok") {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
