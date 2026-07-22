import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";

export type TokenUsage = { inputTokens: number; outputTokens: number };

export type AiTraceFeature = "drug_safety" | "analytics" | "ai_chat" | "ai_admin_chat";

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client: OpenAI | null = null;

  readonly model: string;
  readonly defaults = { temperature: 1, top_p: 0.95, max_tokens: 8192 } as const;

  constructor(private readonly prisma: PrismaService) {
    this.model = process.env["NVIDIA_MODEL"] ?? "nvidia/nemotron-3-ultra-550b-a55b";
  }

  getClient(): OpenAI | null {
    if (this.client) return this.client;
    const apiKey = process.env["NVIDIA_API_KEY"];
    if (!apiKey) return null;
    const baseURL = process.env["NVIDIA_BASE_URL"] ?? "https://integrate.api.nvidia.com/v1";
    this.client = new OpenAI({ apiKey, baseURL });
    return this.client;
  }

  createTraceId(): string {
    return randomUUID();
  }

  extractTokenUsage(completion: { usage?: { prompt_tokens?: number | null; completion_tokens?: number | null } | null }): TokenUsage {
    return {
      inputTokens: Number(completion.usage?.prompt_tokens ?? 0) || 0,
      outputTokens: Number(completion.usage?.completion_tokens ?? 0) || 0,
    };
  }

  addTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
    return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens };
  }

  recordTrace(event: {
    traceId: string;
    tenantId: string | null;
    feature: AiTraceFeature;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    success: boolean;
    fallback: boolean;
    error?: string;
  }): void {
    this.prisma.ai_trace_events.create({
      data: {
        trace_id: event.traceId,
        tenant_id: event.tenantId ?? null,
        feature: event.feature,
        model: this.model,
        input_tokens: event.inputTokens,
        output_tokens: event.outputTokens,
        latency_ms: event.latencyMs,
        success: event.success,
        fallback: event.fallback,
        error: event.error ?? null,
      },
    }).catch((err: unknown) => this.logger.warn("Failed to persist AI trace", err));
  }
}
