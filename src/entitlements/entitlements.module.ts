import { Global, Module } from "@nestjs/common";
import {
  EntitlementsController,
  EntitlementsControllerSupport,
} from "./entitlements.controller";
import { EntitlementsService } from "./entitlements.service";

@Global()
@Module({
  controllers: [EntitlementsController],
  providers: [EntitlementsService, EntitlementsControllerSupport],
  exports: [EntitlementsService],
})
export class EntitlementsModule {}
