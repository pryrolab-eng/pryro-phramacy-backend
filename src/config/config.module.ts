import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import * as path from "path";
import { AppConfigService } from "./app-config.service";
import { validateEnv } from "./env.schema";

const repoRootEnv = path.resolve(__dirname, "../../../.env");
const backendEnv = path.resolve(__dirname, "../../.env");

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [backendEnv, repoRootEnv],
      validate: validateEnv,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService, ConfigModule],
})
export class AppConfigModule {}
