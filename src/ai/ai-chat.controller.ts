import { Body, Controller, HttpException, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { AuthService } from "../auth/auth.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { PrismaService } from "../prisma/prisma.service";
import { AiService } from "./ai.service";
import { AiToolsService } from "./ai-tools.service";
import { AiChatDto } from "./dto/ai-chat.dto";
import { SessionGuard } from "../auth/session.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";

const SYSTEM_PROMPT_PHARMACY = `You are a pharmacy AI assistant. Help with inventory checks, sales queries, patient lookups, and drug safety. Be concise and accurate. Use available tools to retrieve live data.`;
const SYSTEM_PROMPT_ADMIN = `You are a platform admin AI assistant. Help with pharmacy management, subscription oversight, and system analytics. Use available tools to retrieve live data.`;

@ApiTags("AI")
@ApiCookieAuth("pryrox_session")
@Controller("ai")
export class AiChatController {
  constructor(
    private readonly ai: AiService,
    private readonly tools: AiToolsService,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly tenant: TenantContextService,
  ) {}

  @Post("chat")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "AI chat — SSE streaming" })
  async chat(@CurrentUser() user: AuthUser, @Body() body: AiChatDto, @Res() res: Response) {
    const startTime = Date.now();
    const traceId = this.ai.createTraceId();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const send = (data: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      let pharmacyId: string | null = null;
      let isPlatformAdmin = false;

      if (body.scope === "platform_admin") {
        const adminRow = await this.prisma.public_users.findUnique({ where: { id: user.id }, select: { is_platform_admin: true } });
        if (!adminRow?.is_platform_admin) { res.status(403).json({ error: "Forbidden" }); return; }
        isPlatformAdmin = true;
      } else {
        pharmacyId = await this.tenant.requirePharmacyId(user.id);
      }

      // Get or create thread
      let activeThreadId = body.threadId;
      if (!activeThreadId) {
        const thread = await this.prisma.ai_threads.create({
          data: {
            user_id: user.id,
            pharmacy_id: pharmacyId,
            scope: body.scope,
            title: body.messages[0]?.content?.slice(0, 80) ?? "New conversation",
          },
        });
        activeThreadId = thread.id;
      }

      const lastMsg = body.messages[body.messages.length - 1];
      if (lastMsg?.role === "user") {
        await this.prisma.ai_messages.create({ data: { thread_id: activeThreadId, role: "user", content: lastMsg.content } });
      }

      const client = this.ai.getClient();
      if (!client) {
        const fallback = "AI service is not configured. Please contact your administrator.";
        await this.prisma.ai_messages.create({ data: { thread_id: activeThreadId, role: "assistant", content: fallback } });
        send({ type: "done", threadId: activeThreadId, content: fallback });
        res.end(); return;
      }

      const toolDefs = this.tools.getToolDefinitions(body.scope);
      const systemPrompt = body.scope === "pharmacy" ? SYSTEM_PROMPT_PHARMACY : SYSTEM_PROMPT_ADMIN;
      const apiMessages: any[] = [
        { role: "system", content: systemPrompt },
        ...body.messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      let fullContent = "";
      let tokenUsage = { inputTokens: 0, outputTokens: 0 };
      const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>();

      const stream = await client.chat.completions.create({
        model: this.ai.model,
        messages: apiMessages,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        tool_choice: toolDefs.length > 0 ? "auto" : undefined,
        ...this.ai.defaults,
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const chunk of stream) {
        if (chunk.usage) tokenUsage = this.ai.addTokenUsage(tokenUsage, this.ai.extractTokenUsage(chunk));
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;
        if (delta.content) { fullContent += delta.content; send({ type: "text", delta: delta.content }); }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const ex = toolCallMap.get(idx);
            if (ex) {
              if (tc.id) ex.id = tc.id;
              if (tc.function?.name) ex.name = tc.function.name;
              if (tc.function?.arguments) ex.arguments += tc.function.arguments;
            } else {
              toolCallMap.set(idx, { id: tc.id ?? "", name: tc.function?.name ?? "", arguments: tc.function?.arguments ?? "" });
            }
          }
        }
      }

      const executedToolCalls: any[] = [];
      if (toolCallMap.size > 0) {
        const toolCallsArray = Array.from(toolCallMap.values());
        send({ type: "tool_calls", calls: toolCallsArray.map((tc) => ({ id: tc.id, name: tc.name })) });

        for (const tc of toolCallsArray) {
          try {
            const args = JSON.parse(tc.arguments);
            const result = await this.tools.executeTool(tc.name, args, { pharmacyId: pharmacyId ?? undefined, scope: body.scope });
            executedToolCalls.push({ id: tc.id, name: tc.name, args, result });
          } catch (err) {
            executedToolCalls.push({ id: tc.id, name: tc.name, error: String(err) });
          }
        }

        if (executedToolCalls.length > 0) {
          const followUpMessages = [
            { role: "system", content: systemPrompt },
            ...body.messages.map((m) => ({ role: m.role, content: m.content })),
            { role: "assistant", content: fullContent || null, tool_calls: toolCallsArray.map((tc) => ({ id: tc.id, type: "function" as const, function: { name: tc.name, arguments: tc.arguments } })) },
            ...executedToolCalls.map((tc) => ({ role: "tool" as const, tool_call_id: tc.id, content: JSON.stringify(tc.result ?? tc.error ?? tc) })),
          ];
          const followUp = await client.chat.completions.create({ model: this.ai.model, messages: followUpMessages as any, tools: toolDefs, ...this.ai.defaults, stream: true, stream_options: { include_usage: true } });
          let followUpContent = "";
          for await (const chunk of followUp) {
            if (chunk.usage) tokenUsage = this.ai.addTokenUsage(tokenUsage, this.ai.extractTokenUsage(chunk));
            const d = chunk.choices[0]?.delta;
            if (d?.content) { followUpContent += d.content; send({ type: "text", delta: d.content }); }
          }
          fullContent = followUpContent || fullContent;
        }
      }

      const savedMessage = await this.prisma.ai_messages.create({
        data: { thread_id: activeThreadId, role: "assistant", content: fullContent, tool_calls: executedToolCalls.length > 0 ? JSON.parse(JSON.stringify(executedToolCalls)) : null },
      });

      const feature = body.scope === "pharmacy" ? "ai_chat" as const : "ai_admin_chat" as const;
      this.ai.recordTrace({ traceId, tenantId: pharmacyId, feature, inputTokens: tokenUsage.inputTokens, outputTokens: tokenUsage.outputTokens, latencyMs: Date.now() - startTime, success: true, fallback: false });

      send({ type: "done", threadId: activeThreadId, messageId: savedMessage.id, content: fullContent, toolCalls: executedToolCalls.length > 0 ? executedToolCalls : null });
    } catch (err) {
      this.ai.recordTrace({ traceId, tenantId: null, feature: "ai_chat", inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - startTime, success: false, fallback: false, error: String(err) });
      send({ type: "error", error: "Stream failed" });
    } finally {
      res.end();
    }
  }
}
