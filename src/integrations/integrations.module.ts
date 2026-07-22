import { Module } from "@nestjs/common";
import { V1Controller } from "./v1.controller";
import { RraEbmController } from "./rra-ebm.controller";
import { MobileMoneyController } from "./mobile-money.controller";
import { RealtimeController } from "./realtime.controller";
import { IntegrationsV1Service } from "./integrations-v1.service";
import { IntegrationsRraEbmService } from "./integrations-rra-ebm.service";
import { IntegrationsMobileMoneyService } from "./integrations-mobile-money.service";
import { RealtimeService } from "./realtime.service";
import { RealtimeGateway } from "./realtime.gateway";
import { PlatformApiKeyGuard } from "./guards/platform-api-key.guard";

@Module({
  controllers: [V1Controller, RraEbmController, MobileMoneyController, RealtimeController],
  providers: [
    IntegrationsV1Service,
    IntegrationsRraEbmService,
    IntegrationsMobileMoneyService,
    RealtimeService,
    RealtimeGateway,
    PlatformApiKeyGuard,
  ],
  exports: [RealtimeGateway],
})
export class IntegrationsModule {}
