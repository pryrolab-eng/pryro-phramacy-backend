import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { CronBillingService } from "./cron-billing.service";
import { CronClickhouseService } from "./cron-clickhouse.service";
import { CronController } from "./cron.controller";
import { CronDataService } from "./cron-data.service";
import { CronIntegrationsService } from "./cron-integrations.service";
import { CronNotificationsService } from "./cron-notifications.service";
import { CronAlertsService } from "./cron-alerts.service";

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [CronController],
  providers: [
    CronBillingService,
    CronClickhouseService,
    CronDataService,
    CronIntegrationsService,
    CronNotificationsService,
    CronAlertsService,
  ],
})
export class CronModule {}
