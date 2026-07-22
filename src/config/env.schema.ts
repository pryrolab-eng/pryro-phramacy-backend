import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().optional(),
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters"),
  NATIVE_AUTH_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v !== "false"),
  ENTITLEMENTS_ENFORCE: z
    .enum(["true", "false", "0", "1"])
    .optional()
    .transform((v) => v !== "false" && v !== "0"),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  CORS_ORIGINS: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  APP_URL: z.string().optional(),
  UPLOAD_DIR: z.string().optional(),
  // ClickHouse (optional analytics)
  CLICKHOUSE_URL: z.string().optional(),
  CLICKHOUSE_USER: z.string().optional(),
  CLICKHOUSE_PASSWORD: z.string().optional(),
  CLICKHOUSE_DATABASE: z.string().optional(),
  // Redis (optional queue/rate limit)
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.coerce.number().optional(),
  REDIS_PASSWORD: z.string().optional(),
  // NVIDIA AI (optional)
  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_BASE_URL: z.string().optional(),
  NVIDIA_MODEL: z.string().optional(),
  // Cron
  CRON_SECRET: z.string().optional(),
  PENDING_PAYMENT_EXPIRE_DAYS: z.coerce.number().optional(),
  // Polar billing
  POLAR_ACCESS_TOKEN: z.string().optional(),
  POLAR_WEBHOOK_SECRET: z.string().optional(),
  POLAR_SERVER: z.string().optional(),
  POLAR_CHECKOUT_CURRENCY: z.string().optional(),
  POLAR_RWF_PER_USD: z.coerce.number().optional(),
  // SMTP
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_SECURE: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Environment validation failed: ${message}`);
  }
  return parsed.data;
}

export function resolveCorsOrigins(input: {
  CORS_ORIGINS?: string;
  NEXT_PUBLIC_APP_URL?: string;
}): string[] {
  if (input.CORS_ORIGINS?.trim()) {
    return input.CORS_ORIGINS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (input.NEXT_PUBLIC_APP_URL) {
    return [input.NEXT_PUBLIC_APP_URL];
  }
  return ["http://localhost:3000"];
}

export function sessionCookieName(nodeEnv: string): string {
  const prefix = nodeEnv === "production" ? "__Secure-" : "";
  return `${prefix}pryrox_session`;
}
