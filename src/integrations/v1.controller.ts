import { Body, Controller, Delete, Get, HttpException, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { INTEGRATION_V1_PERMISSIONS } from "./dto/v1.dto";
import {
  CreateWebhookDto, CreateWebhookResponseDto, DiscoveryResponseDto, HealthResponseDto,
  IntegrationDeleteWebhookResponseDto, IntegrationInventoryResponseDto,
  IntegrationPharmacyDetailResponseDto, IntegrationPharmacyListResponseDto,
  IntegrationSalesResponseDto, IntegrationWebhookListResponseDto,
} from "./dto";
import { PlatformApiKeyGuard, RequiredPermission, extractPlatformApiKey } from "./guards/platform-api-key.guard";
import type { PlatformApiKeyContext } from "./guards/platform-api-key.guard";
import { IntegrationsV1Service } from "./integrations-v1.service";

@ApiTags("Integrations V1")
@UseGuards(PlatformApiKeyGuard)
@ApiBearerAuth()
@Controller("integrations/v1")
export class V1Controller {
  constructor(private readonly service: IntegrationsV1Service) {}

  @Get("health")
  @ApiOperation({ summary: "Liveness check; confirms API key is valid" })
  @ApiOkResponse({ type: HealthResponseDto })
  getHealth(@Req() req: Request) {
    const key = extractPlatformApiKey(req)!;
    return this.service.getHealth(key);
  }

  @Get()
  @ApiOperation({ summary: "Discovery document listing all endpoints and permissions" })
  @ApiOkResponse({ type: DiscoveryResponseDto })
  getDiscovery(@Req() req: Request) {
    const key = extractPlatformApiKey(req)!;
    return this.service.getDiscovery(key);
  }

  @Get("pharmacies")
  @RequiredPermission(INTEGRATION_V1_PERMISSIONS.pharmaciesRead)
  @ApiOperation({ summary: "List pharmacies (active by default)" })
  @ApiQuery({ name: "includeInactive", required: false, type: Boolean, description: "Set to true to include inactive pharmacies" })
  @ApiOkResponse({ type: IntegrationPharmacyListResponseDto })
  async listPharmacies(@Query("includeInactive") includeInactive?: string) {
    try {
      return await this.service.listPharmacies(includeInactive === "true");
    } catch (error) {
      throw new HttpException({ error: "Failed to list pharmacies" }, 500);
    }
  }

  @Get("pharmacies/:id")
  @RequiredPermission(INTEGRATION_V1_PERMISSIONS.pharmaciesRead)
  @ApiOperation({ summary: "Get pharmacy detail with branch list" })
  @ApiOkResponse({ type: IntegrationPharmacyDetailResponseDto })
  async getPharmacy(@Param("id") id: string) {
    try {
      const pharmacy = await this.service.getPharmacyDetail(id);
      if (!pharmacy) throw new HttpException({ error: "Pharmacy not found" }, 404);
      return { pharmacy };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to get pharmacy" }, 500);
    }
  }

  @Get("inventory")
  @RequiredPermission(INTEGRATION_V1_PERMISSIONS.inventoryRead)
  @ApiOperation({ summary: "List pharmacy inventory" })
  @ApiQuery({ name: "pharmacyId", required: true, type: String })
  @ApiQuery({ name: "branchId", required: false, type: String })
  @ApiOkResponse({ type: IntegrationInventoryResponseDto })
  async getInventory(@Query("pharmacyId") pharmacyId: string, @Query("branchId") branchId?: string) {
    if (!pharmacyId) throw new HttpException({ error: "pharmacyId query parameter is required" }, 400);
    try {
      if (!(await this.service.pharmacyExists(pharmacyId))) {
        throw new HttpException({ error: "Pharmacy not found" }, 404);
      }
      const inventory = await this.service.listInventory(pharmacyId, branchId);
      return { pharmacyId, branchId: branchId ?? null, inventory, count: inventory.length };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to list inventory" }, 500);
    }
  }

  @Get("sales")
  @RequiredPermission(INTEGRATION_V1_PERMISSIONS.salesRead)
  @ApiOperation({ summary: "List completed sales with line-item counts" })
  @ApiQuery({ name: "pharmacyId", required: true, type: String })
  @ApiQuery({ name: "from", required: false, type: String, description: "ISO date (inclusive)" })
  @ApiQuery({ name: "to", required: false, type: String, description: "ISO date (inclusive)" })
  @ApiQuery({ name: "limit", required: false, type: Number, description: "Max records (1-200, default 50)" })
  @ApiOkResponse({ type: IntegrationSalesResponseDto })
  async getSales(
    @Query("pharmacyId") pharmacyId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("limit") limit?: string,
  ) {
    if (!pharmacyId) throw new HttpException({ error: "pharmacyId query parameter is required" }, 400);
    try {
      if (!(await this.service.pharmacyExists(pharmacyId))) {
        throw new HttpException({ error: "Pharmacy not found" }, 404);
      }

      const parsedFrom = from ? new Date(from) : undefined;
      const parsedTo = to ? (() => { const d = new Date(to); d.setHours(23, 59, 59, 999); return d; })() : undefined;
      const parsedLimit = Math.min(Math.max(Math.floor(Number(limit ?? 50)), 1), 200);

      const result = await this.service.listSales({
        pharmacyId, from: parsedFrom && !Number.isNaN(parsedFrom.getTime()) ? parsedFrom : undefined,
        to: parsedTo && !Number.isNaN(parsedTo.getTime()) ? parsedTo : undefined,
        limit: parsedLimit,
      });

      return { pharmacyId, from: parsedFrom?.toISOString() ?? null, to: parsedTo?.toISOString() ?? null, ...result };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to list sales" }, 500);
    }
  }

  @Get("webhooks")
  @RequiredPermission(INTEGRATION_V1_PERMISSIONS.webhooksManage)
  @ApiOperation({ summary: "List webhooks registered by this API key" })
  @ApiOkResponse({ type: IntegrationWebhookListResponseDto })
  async listWebhooks(@Req() req: Request) {
    try {
      const key = extractPlatformApiKey(req)!;
      return await this.service.listWebhooks(key.id);
    } catch (error) {
      throw new HttpException({ error: "Failed to list webhooks" }, 500);
    }
  }

  @Post("webhooks")
  @RequiredPermission(INTEGRATION_V1_PERMISSIONS.webhooksManage)
  @ApiOperation({ summary: "Register an outbound webhook URL and event subscriptions" })
  @ApiOkResponse({ type: CreateWebhookResponseDto })
  async createWebhook(@Req() req: Request, @Body() body: CreateWebhookDto) {
    const key = extractPlatformApiKey(req)!;

    if (!body.url || !/^https?:\/\//i.test(body.url)) {
      throw new HttpException({ error: "A valid http(s) webhook url is required" }, 400);
    }

    const allowedEvents = ["sale.completed", "inventory.low_stock", "inventory.expiring_soon"];
    const events = Array.isArray(body.events) ? body.events.filter((e: string) => typeof e === "string" && (e === "*" || allowedEvents.includes(e))) : [];
    const normalizedEvents = events.includes("*") ? [...allowedEvents] : [...new Set(events)];

    if (normalizedEvents.length === 0) {
      throw new HttpException({ error: "At least one event subscription is required" }, 400);
    }

    try {
      return await this.service.createWebhook(key.id, body.url, normalizedEvents, body.secret);
    } catch (error) {
      throw new HttpException({ error: "Failed to create webhook" }, 500);
    }
  }

  @Delete("webhooks/:id")
  @RequiredPermission(INTEGRATION_V1_PERMISSIONS.webhooksManage)
  @ApiOperation({ summary: "Deactivate a webhook owned by this API key" })
  @ApiOkResponse({ type: IntegrationDeleteWebhookResponseDto })
  async deleteWebhook(@Req() req: Request, @Param("id") webhookId: string) {
    try {
      const key = extractPlatformApiKey(req)!;
      const removed = await this.service.deleteWebhook(webhookId, key.id);
      if (!removed) throw new HttpException({ error: "Webhook not found" }, 404);
      return { success: true };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: "Failed to delete webhook" }, 500);
    }
  }
}
