import { Module } from "@nestjs/common";
import { AlertsController, StockAlertsController } from "./alerts.controller";
import { AlertsService } from "./alerts.service";

@Module({
  controllers: [AlertsController, StockAlertsController],
  providers: [AlertsService],
})
export class AlertsModule {}
