import { Module } from "@nestjs/common";
import {
  BroadcastController,
  NotificationsController,
} from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

@Module({
  controllers: [NotificationsController, BroadcastController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
