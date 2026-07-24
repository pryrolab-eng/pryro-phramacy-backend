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
const SYSTEM_PROMPT_ADMIN = `You are a platform admin AI assistant for Pryrox pharmacy management. Help with pharmacy management, subscription oversight, and system analytics. Use available tools to retrieve live data. Plans can be monthly or yearly billing — the tool results include billing_period, price, and yearly_price. Always mention the currency when discussing revenue or payments.

INTERACTIVE USER FORM QUESTIONS (A2UI):
- CRITICAL: Whenever you need to ask the user questions, gather design preferences (e.g. brand colors, typography/fonts, tone, layout options, badges, image preferences), or collect configuration parameters, DO NOT TYPE BULLET POINT QUESTIONS IN PLAIN TEXT.
- YOU MUST CALL THE \`ask_user\` TOOL! The \`ask_user\` tool renders a rich interactive form (with selectable radio option buttons, text inputs, and submit buttons) directly in the UI so the user can easily select or type their choices.

EMAIL TEMPLATE MANAGEMENT:
- You can list, view, and update platform email templates using your tools.
- When asked to update or redesign an email template, FIRST call \`ask_user\` with interactive choice fields for:
  1. \`brand_color\` (type: "choice", options: ["Primary Blue (#003459)", "Emerald Green (#059669)", "Dark Slate (#0f172a)", "Custom HEX"])
  2. \`font_style\` (type: "choice", options: ["Modern Sans (Inter/Roboto)", "Classic Serif (Georgia)", "System Default"])
  3. \`layout_style\` (type: "choice", options: ["Centered Card with Header", "Full Width Banner", "Minimal Clean Text"])
  4. \`tone\` (type: "choice", options: ["Formal & Official", "Professional & Friendly", "Urgent Alert"])
- After the user submits their choices via the \`ask_user\` form, generate a professional, responsive HTML email template with inline CSS (email-client safe) and save it using \`update_email_template\`.
- Preserve template variables like {{variableName}} — they are replaced at send time.

EMAIL COMPOSITION & SENDING:
- You are a skilled email writer. When asked to compose or send an email, if key details are missing, call \`ask_user\` to collect them.
- ALWAYS use the \`draft_email\` tool first so the admin can preview the email and click the interactive Send button. Never call send_email directly.
- Write emails that are professional, clear, and well-structured with proper HTML formatting.`;

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
            const result = await this.tools.executeTool(tc.name, args, { pharmacyId: pharmacyId ?? undefined, scope: body.scope, userId: user.id });
            executedToolCalls.push({ id: tc.id, name: tc.name, args, result });
          } catch (err) {
            executedToolCalls.push({ id: tc.id, name: tc.name, error: String(err) });
          }
        }

        if (executedToolCalls.length > 0) {
          const toolResultsText = executedToolCalls.map((tc) => {
            const name = tc.name;
            const result = JSON.stringify(tc.result ?? tc.error ?? "No result");
            return `[Tool ${name} result]: ${result}`;
          }).join("\n\n");

          const followUpMessages = [
            { role: "system", content: systemPrompt },
            ...body.messages.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: `I asked you to use these tools. Here are the results:\n\n${toolResultsText}\n\nPlease summarize these results for the user in a clear, concise way.` },
          ];
          const followUp = await client.chat.completions.create({ model: this.ai.model, messages: followUpMessages as any, ...this.ai.defaults, stream: true, stream_options: { include_usage: true } });
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
      console.error("[AI Chat] Error:", err);
      this.ai.recordTrace({ traceId, tenantId: null, feature: "ai_chat", inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - startTime, success: false, fallback: false, error: String(err) });
      send({ type: "error", error: "Stream failed" });
    } finally {
      res.end();
    }
  }

  @Post("send-email")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Send a drafted email (triggered by chat Send button)" })
  async sendEmail(@CurrentUser() user: AuthUser, @Body() body: { to: string; subject: string; html: string; text?: string }, @Res() res: Response) {
    try {
      const adminRow = await this.prisma.public_users.findUnique({ where: { id: user.id }, select: { is_platform_admin: true } });
      if (!adminRow?.is_platform_admin) {
        res.status(403).json({ error: "Forbidden — platform admin only" });
        return;
      }
      const result = await this.tools.sendEmail(body);
      res.json(result);
    } catch (err) {
      console.error("[AI Send Email] Error:", err);
      res.status(500).json({ success: false, error: "Failed to send email" });
    }
  }
}
