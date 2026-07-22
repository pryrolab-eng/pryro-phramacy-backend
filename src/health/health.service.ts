import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ClickhouseService } from "../clickhouse/clickhouse.service";

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ch: ClickhouseService,
  ) {}

  liveness() {
    return { status: "ok" as const };
  }

  async readiness(): Promise<{ status: "ok" | "error"; database: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", database: "connected" };
    } catch {
      return { status: "error", database: "disconnected" };
    }
  }

  async platformConfig(): Promise<{
    maintenanceActive: boolean;
    enableRegistrations: boolean;
    apiRateLimit: number;
  }> {
    try {
      const rows = await this.prisma.system_settings.findMany({
        where: {
          pharmacy_id: null,
          setting_key: { in: ["scheduledMaintenance", "enableRegistrations", "apiRateLimit"] },
        },
        select: { setting_key: true, setting_value: true },
      });

      const map: Record<string, unknown> = {};
      for (const row of rows) map[row.setting_key] = row.setting_value;

      // Maintenance active?
      let maintenanceActive = false;
      try {
        const m = map["scheduledMaintenance"];
        if (m && typeof m === "object" && !Array.isArray(m)) {
          const maintenance = m as Record<string, unknown>;
          if (maintenance["enabled"] && maintenance["scheduledAt"]) {
            maintenanceActive = new Date(maintenance["scheduledAt"] as string) <= new Date();
          }
        }
      } catch { /* keep false */ }

      // Registrations enabled?
      const regRaw = map["enableRegistrations"];
      const enableRegistrations = regRaw !== false && regRaw !== "false" && regRaw !== 0;

      // API rate limit
      const rlRaw = Number(map["apiRateLimit"] ?? 120);
      const apiRateLimit = Number.isFinite(rlRaw) && rlRaw > 0 ? Math.floor(rlRaw) : 120;

      return { maintenanceActive, enableRegistrations, apiRateLimit };
    } catch {
      return { maintenanceActive: false, enableRegistrations: true, apiRateLimit: 120 };
    }
  }

  async clickhouseDiagnostic() {
    if (!this.ch.isConfigured()) {
      return {
        configured: false,
        status: "not_configured",
        message: "CLICKHOUSE_URL is not set. All queries use Postgres.",
        latencyMs: null,
        rowCounts: null,
      };
    }

    const start = Date.now();
    try {
      const db = this.ch.database;
      const [pingRows, salesRows, categoryRows] = await Promise.all([
        this.ch.query<{ version: string }>(`SELECT version() as version`),
        this.ch.query<{ cnt: string }>(`SELECT toString(count()) as cnt FROM ${db}.sales_fact`),
        this.ch.query<{ cnt: string }>(`SELECT toString(count()) as cnt FROM ${db}.category_sales_agg`),
      ]);

      const latencyMs = Date.now() - start;
      return {
        configured: true,
        status: "connected",
        message: `ClickHouse is active and serving analytics queries. All dashboard/report queries use ClickHouse instead of Postgres.`,
        latencyMs,
        version: pingRows[0]?.version ?? "unknown",
        rowCounts: {
          sales_fact: Number(salesRows[0]?.cnt ?? 0),
          category_sales_agg: Number(categoryRows[0]?.cnt ?? 0),
        },
        note: salesRows[0] && Number(salesRows[0].cnt) === 0
          ? "No data synced yet. Run GET /api/cron/clickhouse-sync to populate."
          : `${Number(salesRows[0]?.cnt ?? 0).toLocaleString()} sale records indexed.`,
      };
    } catch (err) {
      return {
        configured: true,
        status: "error",
        message: `ClickHouse is configured but unreachable: ${err instanceof Error ? err.message : String(err)}`,
        latencyMs: Date.now() - start,
        rowCounts: null,
      };
    }
  }
}
