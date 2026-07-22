import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { MaintenanceService } from "./maintenance.service";
import { MaintenanceProcessor } from "./maintenance.processor";
import { MaintenanceController } from "./maintenance.controller";
import { AppConfigService } from "../config/app-config.service";

function getRedisConfig() {
  if (process.env["REDIS_URL"]) {
    const url = new URL(process.env["REDIS_URL"]);
    const isTLS = url.protocol === "rediss:";
    return {
      host: url.hostname,
      port: Number(url.port || (isTLS ? 6380 : 6379)),
      password: url.password || undefined,
      tls: isTLS ? {} : undefined,
    };
  }
  return {
    host: process.env["REDIS_HOST"] ?? "127.0.0.1",
    port: Number(process.env["REDIS_PORT"] ?? 6379),
    password: process.env["REDIS_PASSWORD"] || undefined,
  };
}

const isRedisConfigured = Boolean(
  process.env["REDIS_URL"] || process.env["REDIS_HOST"],
);

@Module({
  imports: isRedisConfigured
    ? [
        BullModule.forRoot({ redis: getRedisConfig() }),
        BullModule.registerQueue({ name: "maintenance-notify" }),
      ]
    : [],
  controllers: [MaintenanceController],
  providers: [MaintenanceService, MaintenanceProcessor],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
