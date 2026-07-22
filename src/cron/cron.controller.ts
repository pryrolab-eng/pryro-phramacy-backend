import { Controller, Get, HttpException, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CronBillingService } from "./cron-billing.service";
import { CronClickhouseService } from "./cron-clickhouse.service";
import { CronDataService } from "./cron-data.service";
import { CronIntegrationsService } from "./cron-integrations.service";
import { CronNotificationsService } from "./cron-notifications.service";
import { CronAlertsService } from "./cron-alerts.service";

function authorizeCron(request: Request): boolean {
  const secret = process.env["CRON_SECRET"];
  if (!secret) return process.env["NODE_ENV"] === "development";
  const authHeader = request.headers["authorization"];
  if (authHeader === `Bearer ${secret}`) return true;
  const headerSecret = request.headers["x-cron-secret"];
  if (headerSecret === secret) return true;
  const urlSecret = new URL(`http://x${request.url}`).searchParams.get("secret");
  if (urlSecret === secret) return true;
  return false;
}

@ApiTags("Cron")
@Controller("cron")
export class CronController {
  constructor(
    private readonly billing: CronBillingService,
    private readonly clickhouse: CronClickhouseService,
    private readonly data: CronDataService,
    private readonly integrations: CronIntegrationsService,
    private readonly notifications: CronNotificationsService,
    private readonly alerts: CronAlertsService,
  ) {}

  @Get("cancel-stale-pending-payments")
  @ApiOperation({ summary: "Cancel stale pending payments (cron)" })
  async cancelStalePendingPayments(@Req() req: Request) {
    if (!authorizeCron(req)) throw new HttpException({ error: "Unauthorized" }, 401);
    return this.billing.runCancelStalePendingPayments();
  }

  @Get("subscription-transitions")
  @ApiOperation({ summary: "Apply scheduled subscription transitions (cron)" })
  async subscriptionTransitions(@Req() req: Request) {
    if (!authorizeCron(req)) throw new HttpException({ error: "Unauthorized" }, 401);
    return this.billing.runSubscriptionTransitions();
  }

  @Get("subscription-renewal-reminders")
  @ApiOperation({ summary: "Send subscription renewal reminder notifications (cron)" })
  async subscriptionRenewalReminders(@Req() req: Request) {
    if (!authorizeCron(req)) throw new HttpException({ error: "Unauthorized" }, 401);
    return this.billing.runRenewalReminders();
  }

  @Get("clickhouse-sync")
  @ApiOperation({ summary: "Sync sales to ClickHouse (cron)" })
  async clickhouseSync(@Req() req: Request) {
    if (!authorizeCron(req)) throw new HttpException({ error: "Unauthorized" }, 401);
    return this.clickhouse.runClickhouseSync();
  }

  @Get("data-retention")
  @ApiOperation({ summary: "Purge expired platform data (cron)" })
  async dataRetention(@Req() req: Request) {
    if (!authorizeCron(req)) throw new HttpException({ error: "Unauthorized" }, 401);
    return this.data.runDataRetention();
  }

  @Get("integration-events")
  @ApiOperation({ summary: "Dispatch inventory integration events (cron)" })
  async integrationEvents(@Req() req: Request) {
    if (!authorizeCron(req)) throw new HttpException({ error: "Unauthorized" }, 401);
    return this.integrations.runIntegrationEvents();
  }

  @Get("notification-dispatch")
  @ApiOperation({ summary: "Dispatch pending notifications (cron)" })
  async notificationDispatch(@Req() req: Request) {
    if (!authorizeCron(req)) throw new HttpException({ error: "Unauthorized" }, 401);
    return this.notifications.runNotificationDispatch();
  }

  @Get("webhook-dispatch")
  @ApiOperation({ summary: "Deliver pending webhooks (cron)" })
  async webhookDispatch(@Req() req: Request) {
    if (!authorizeCron(req)) throw new HttpException({ error: "Unauthorized" }, 401);
    return this.integrations.runWebhookDispatch();
  }

  @Get("inventory-alerts")
  @ApiOperation({ summary: "Scan pharmacies for low stock and expiring items, queue notifications (cron)" })
  async inventoryAlerts(@Req() req: Request) {
    if (!authorizeCron(req)) throw new HttpException({ error: "Unauthorized" }, 401);
    return this.alerts.runInventoryAlerts();
  }
}
