import { Controller, Get, HttpException } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PlansListResponseDto } from "./dto";
import { PlansService } from "./plans.service";

@ApiTags("Plans")
@Controller("plans")
export class PlansController {
  constructor(private readonly service: PlansService) {}

  @Get()
  @ApiOperation({ summary: "List available subscription plans" })
  @ApiOkResponse({ type: PlansListResponseDto })
  async listPlans() {
    try {
      return { plans: await this.service.listPlans() };
    } catch (error) {
      console.error("GET /api/plans", error);
      throw new HttpException({ error: "Failed to fetch plans" }, 500);
    }
  }
}
