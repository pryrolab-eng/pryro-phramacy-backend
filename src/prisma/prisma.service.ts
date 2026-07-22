import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { AppConfigService } from "../config/app-config.service";

function resolveDatasourceUrl(rawUrl: string, nodeEnv: string): string {
  try {
    const url = new URL(rawUrl);
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", nodeEnv === "development" ? "10" : "10");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "20");
    }
    if (!url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly appConfig: AppConfigService) {
    const datasourceUrl = resolveDatasourceUrl(
      appConfig.databaseUrl,
      appConfig.nodeEnv,
    );
    super({
      datasourceUrl,
      log: appConfig.nodeEnv === "development" ? ["error", "warn"] : ["error"],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
