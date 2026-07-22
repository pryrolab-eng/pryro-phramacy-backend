import { Module } from "@nestjs/common";
import { SubscriptionsController } from "./subscriptions.controller";
import { PolarController } from "./polar.controller";
import { SaaSController } from "./saas.controller";
import { SubscriptionService } from "./subscription.service";
import { PolarService } from "./polar.service";
import { SaaSService } from "./saas.service";
import { IntegrationsModule } from "../integrations/integrations.module";

@Module({
  imports: [IntegrationsModule],
  controllers: [SubscriptionsController, PolarController, SaaSController],
  providers: [SubscriptionService, PolarService, SaaSService],
})
export class BillingModule {}
