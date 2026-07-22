import { Body, Controller, Delete, Get, HttpException, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service";
import { SessionGuard } from "../auth/session.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { CreateThreadDto } from "./dto/ai-chat.dto";

@ApiTags("AI")
@ApiCookieAuth("pryrox_session")
@Controller("ai/threads")
export class AiThreadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "List AI conversation threads" })
  async list(@CurrentUser() user: AuthUser, @Query("scope") scope?: string) {
    const threads = await this.prisma.ai_threads.findMany({
      where: { user_id: user.id, scope: scope ?? "pharmacy" },
      orderBy: { updated_at: "desc" },
      take: 50,
    });
    return { threads };
  }

  @Post()
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Create a new AI conversation thread" })
  async create(@CurrentUser() user: AuthUser, @Body() body: CreateThreadDto) {
    const thread = await this.prisma.ai_threads.create({
      data: {
        user_id: user.id,
        scope: body.scope,
        title: body.title ?? "New conversation",
      },
    });
    return { thread };
  }

  @Get(":id/messages")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "List messages in an AI thread" })
  async messages(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const thread = await this.prisma.ai_threads.findUnique({ where: { id } });
    if (!thread || thread.user_id !== user.id) {
      throw new HttpException({ error: "Not found" }, 404);
    }
    const messages = await this.prisma.ai_messages.findMany({
      where: { thread_id: id },
      orderBy: { created_at: "asc" },
    });
    return { messages };
  }

  @Delete(":id")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "Delete an AI conversation thread" })
  async delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const thread = await this.prisma.ai_threads.findUnique({ where: { id } });
    if (!thread || thread.user_id !== user.id) {
      throw new HttpException({ error: "Not found" }, 404);
    }
    await this.prisma.ai_messages.deleteMany({ where: { thread_id: id } });
    await this.prisma.ai_threads.delete({ where: { id } });
    return { success: true };
  }
}
