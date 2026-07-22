import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import type { AuthUser } from "../auth/auth.types";
import { ErrorResponseDto } from "../common/dto";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { NotificationsService } from "./notifications.service";
import {
  CreateNotificationDto,
  CreateNotificationResponseDto,
  DeletePushSubscriptionDto,
  DeletePushSubscriptionResponseDto,
  DeprecatedBroadcastResponseDto,
  MarkNotificationReadResponseDto,
  NotificationDto,
  NotificationPreferencesDto,
  PushSubscriptionsResponseDto,
  SavePushSubscriptionDto,
  SavePushSubscriptionResponseDto,
  UpdateNotificationPreferencesDto,
} from "./dto";
import type { NotificationPrefs } from "./models";

const notificationIdExample = "30a7b13b-f41e-458f-8fb2-30ea9dca8794";

@ApiTags("Notifications")
@ApiCookieAuth("pryrox_session")
@Controller("notifications")
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly tenant: TenantContextService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List notifications", description: "Returns up to 50 notifications for the authenticated pharmacy. Platform administrators may request platform-wide notifications by setting `scope=platform`." })
  @ApiQuery({ name: "scope", required: false, enum: ["pharmacy", "platform"], description: "Notification ownership scope. `platform` requires platform-administrator privileges; omitted or `pharmacy` uses the user's pharmacy.", example: "pharmacy" })
  @ApiOkResponse({ description: "Notifications were returned newest first.", type: NotificationDto, isArray: true })
  @ApiResponse({ status: 400, description: "The query parameters are invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "Platform scope was requested by a non-platform administrator.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The authenticated user has no pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Notifications could not be fetched.", type: ErrorResponseDto })
  async list(@CurrentUser() user: AuthUser, @Query("scope") scope?: string) {
    try {
      const platform = scope === "platform";
      if (platform && !(await this.service.isPlatformAdmin(user.id))) {
        throw new HttpException({ error: "Forbidden" }, 403);
      }
      const pharmacyId = platform
        ? null
        : await this.tenant.requirePharmacyId(user.id);
      return (await this.service.list(pharmacyId)).map((row) =>
        this.service.format(row),
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const message =
        error instanceof Error ? error.message : "Failed to fetch notifications";
      throw new HttpException({ error: message }, message === "Pharmacy not found" ? 404 : 500);
    }
  }

  @Post()
  @ApiOperation({ summary: "Create a notification", description: "Creates an unread notification for the authenticated user's pharmacy." })
  @ApiBody({ required: true, description: "Notification content.", type: CreateNotificationDto })
  @ApiResponse({ status: 201, description: "The notification was created.", type: CreateNotificationResponseDto })
  @ApiResponse({ status: 400, description: "The notification body is invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user cannot create notifications.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The authenticated user has no pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The notification could not be created.", type: ErrorResponseDto })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: { title: string; message: string; type?: string },
  ) {
    try {
      const notification = await this.prisma.notifications.create({
        data: {
          pharmacy_id: await this.tenant.requirePharmacyId(user.id),
          title: body.title,
          message: body.message,
          type: body.type ?? "info",
          is_read: false,
        },
        select: {
          id: true,
          title: true,
          message: true,
          type: true,
          is_read: true,
          created_at: true,
          action_url: true,
        },
      });
      return { success: true, notification };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create notification";
      throw new HttpException({ error: message }, message === "Pharmacy not found" ? 404 : 500);
    }
  }

  @Get("preferences")
  @ApiOperation({ summary: "Get notification preferences", description: "Returns the authenticated user's notification event and delivery-channel preferences, using defaults when no saved preferences exist." })
  @ApiOkResponse({ description: "Notification preferences were returned.", type: NotificationPreferencesDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user cannot view preferences.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The authenticated user has no pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Notification preferences could not be loaded.", type: ErrorResponseDto })
  async preferences(@CurrentUser() user: AuthUser) {
    try {
      return this.toApi(
        await this.service.getPrefs(
          user.id,
          await this.tenant.requirePharmacyId(user.id),
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load notification preferences";
      throw new HttpException({ error: message }, message === "Pharmacy not found" ? 404 : 500);
    }
  }

  @Put("preferences")
  @ApiOperation({ summary: "Save notification preferences", description: "Upserts the authenticated user's event and delivery-channel preferences. Omitted booleans use the endpoint's documented defaults." })
  @ApiBody({ required: true, description: "Complete or partial notification preference values.", type: UpdateNotificationPreferencesDto })
  @ApiOkResponse({ description: "Preferences were saved and returned in API form.", type: NotificationPreferencesDto })
  @ApiResponse({ status: 400, description: "The preference body is invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user cannot update preferences.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The authenticated user has no pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Notification preferences could not be saved.", type: ErrorResponseDto })
  async savePreferences(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const prefs: NotificationPrefs = {
        channelInApp: body.desktop !== false,
        channelEmail: body.email !== false,
        channelPush: body.push === true,
        dailyUpdate: body.dailyUpdate !== false,
        lowStock: body.lowStock !== false,
        expiry: body.expiry !== false,
        salesReports: body.salesReports === true,
        systemUpdates: body.systemUpdates !== false,
      };
      await this.service.savePrefs(
        user.id,
        await this.tenant.requirePharmacyId(user.id),
        prefs,
      );
      return this.toApi(prefs);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to save notification preferences";
      throw new HttpException({ error: message }, message === "Pharmacy not found" ? 404 : 500);
    }
  }

  @Patch(":id/read")
  @ApiOperation({ summary: "Mark a notification as read", description: "Marks a pharmacy notification as read, or a platform notification when requested by a platform administrator." })
  @ApiParam({ name: "id", required: true, type: String, description: "Notification UUID to mark as read.", example: notificationIdExample })
  @ApiQuery({ name: "scope", required: false, enum: ["pharmacy", "platform"], description: "Notification ownership scope. `platform` requires platform-administrator privileges.", example: "pharmacy" })
  @ApiOkResponse({ description: "The notification was marked as read.", type: MarkNotificationReadResponseDto })
  @ApiResponse({ status: 400, description: "The notification ID or scope is invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "Platform scope was requested by a non-platform administrator.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The notification or authenticated user's pharmacy was not found.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The notification could not be marked as read.", type: ErrorResponseDto })
  async read(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("scope") scope?: string,
  ) {
    try {
      const platform = scope === "platform";
      if (platform && !(await this.service.isPlatformAdmin(user.id))) {
        throw new HttpException({ error: "Forbidden" }, 403);
      }
      const result = await this.prisma.notifications.updateMany({
        where: {
          id,
          pharmacy_id: platform
            ? null
            : await this.tenant.requirePharmacyId(user.id),
        },
        data: { is_read: true },
      });
      if (!result.count) {
        throw new HttpException({ error: "Notification not found" }, 404);
      }
      return { success: true };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const message =
        error instanceof Error
          ? error.message
          : "Failed to mark notification read";
      throw new HttpException({ error: message }, message === "Pharmacy not found" ? 404 : 500);
    }
  }

  @Get("stream")
  @ApiOperation({ summary: "Stream live notifications", description: "Opens a Server-Sent Events connection, emits an initial `connected` event, then polls every ten seconds for new pharmacy or platform notifications until the client disconnects." })
  @ApiQuery({ name: "scope", required: false, enum: ["pharmacy", "platform"], description: "Stream ownership scope. `platform` requires platform-administrator privileges.", example: "pharmacy" })
  @ApiProduces("text/event-stream")
  @ApiResponse({
    status: 200,
    description: "A Server-Sent Events stream. Each event is encoded as `data: <JSON>\\n\\n` and is either a connection acknowledgement or a notification.",
    content: {
      "text/event-stream": {
        schema: { type: "string", description: "SSE frames containing JSON connection and notification payloads.", example: "data: {\"type\":\"connected\",\"scope\":\"pharmacy\",\"pharmacyId\":\"a30ea6f1-2be8-4cb6-81df-cbf4e6546ff2\"}\n\ndata: {\"type\":\"notification\",\"notification\":{\"id\":\"30a7b13b-f41e-458f-8fb2-30ea9dca8794\",\"title\":\"Low stock warning\",\"message\":\"Amoxicillin 500 mg has 8 units remaining.\",\"type\":\"low_stock\",\"read\":false,\"date\":\"2026-07-21T09:15:00.000Z\",\"actionUrl\":\"/inventory/low-stock\"}}\n\n" },
        example: "data: {\"type\":\"connected\",\"scope\":\"pharmacy\",\"pharmacyId\":\"a30ea6f1-2be8-4cb6-81df-cbf4e6546ff2\"}\n\ndata: {\"type\":\"notification\",\"notification\":{\"id\":\"30a7b13b-f41e-458f-8fb2-30ea9dca8794\",\"title\":\"Low stock warning\",\"message\":\"Amoxicillin 500 mg has 8 units remaining.\",\"type\":\"low_stock\",\"read\":false,\"date\":\"2026-07-21T09:15:00.000Z\",\"actionUrl\":\"/inventory/low-stock\"}}\n\n",
      },
    },
  })
  @ApiResponse({ status: 400, description: "The stream query is invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "Platform scope was requested by a non-platform administrator.", content: { "text/plain": { schema: { type: "string", description: "Plain-text authorization failure.", example: "Forbidden" }, example: "Forbidden" } } })
  @ApiResponse({ status: 404, description: "The authenticated user has no pharmacy.", content: { "text/plain": { schema: { type: "string", description: "Plain-text pharmacy lookup failure.", example: "Pharmacy not found" }, example: "Pharmacy not found" } } })
  @ApiResponse({ status: 500, description: "The notification stream could not be established.", type: ErrorResponseDto })
  async stream(
    @CurrentUser() user: AuthUser,
    @Query("scope") scope: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const platform = scope === "platform";
    if (platform && !(await this.service.isPlatformAdmin(user.id))) {
      response.status(403).send("Forbidden");
      return;
    }
    let pharmacyId: string | null = null;
    if (!platform) {
      try {
        pharmacyId = await this.tenant.requirePharmacyId(user.id);
      } catch {
        response.status(404).send("Pharmacy not found");
        return;
      }
    }
    response.status(200);
    response.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    response.flushHeaders();
    let lastSeen = new Date();
    let closed = false;
    const send = (payload: unknown) => {
      if (!closed) response.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    send({ type: "connected", scope: platform ? "platform" : "pharmacy", pharmacyId });
    const poll = async () => {
      if (closed) return;
      try {
        const rows = await this.service.list(pharmacyId, lastSeen);
        for (const row of rows) {
          if (row.created_at) lastSeen = row.created_at;
          send({ type: "notification", notification: this.service.format(row) });
        }
      } catch (error) {
        console.error("notifications stream poll:", error);
      }
    };
    const interval = setInterval(() => void poll(), 20_000); // 20s — reduces DB pressure
    void poll();
    request.on("close", () => {
      closed = true;
      clearInterval(interval);
      response.end();
    });
  }

  @Get("push-subscriptions")
  @ApiOperation({ summary: "List push subscriptions", description: "Returns the authenticated user's web push subscriptions for their pharmacy, ordered by most recently updated." })
  @ApiOkResponse({ description: "Push subscriptions were returned without private key material.", type: PushSubscriptionsResponseDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user cannot view push subscriptions.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The authenticated user has no pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "Push subscriptions could not be loaded.", type: ErrorResponseDto })
  async pushSubscriptions(@CurrentUser() user: AuthUser) {
    try {
      const subscriptions = await this.prisma.push_subscriptions.findMany({
        where: {
          user_id: user.id,
          pharmacy_id: await this.tenant.requirePharmacyId(user.id),
        },
        select: { id: true, endpoint: true, created_at: true, updated_at: true },
        orderBy: { updated_at: "desc" },
      });
      return { subscriptions };
    } catch (error) {
      console.error("GET /api/notifications/push-subscriptions", error);
      throw new HttpException({ error: "Failed to load push subscriptions" }, 500);
    }
  }

  @Post("push-subscriptions")
  @ApiOperation({ summary: "Save a push subscription", description: "Creates or updates a web push subscription by endpoint for the authenticated user and pharmacy. Keys may be nested under `keys` or supplied at the top level." })
  @ApiBody({ required: true, description: "Web Push API subscription data.", type: SavePushSubscriptionDto })
  @ApiResponse({ status: 201, description: "The push subscription was created or updated.", type: SavePushSubscriptionResponseDto })
  @ApiResponse({ status: 400, description: "The endpoint or required encryption keys are missing.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user cannot manage push subscriptions.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "The authenticated user has no pharmacy.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The push subscription could not be saved.", type: ErrorResponseDto })
  async savePush(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ) {
    try {
      const keys =
        body.keys && typeof body.keys === "object"
          ? (body.keys as Record<string, unknown>)
          : {};
      const endpoint = String(body.endpoint ?? "").trim();
      const p256dh = String(keys.p256dh ?? body.p256dh ?? "").trim();
      const auth = String(keys.auth ?? body.auth ?? "").trim();
      if (!endpoint || !p256dh || !auth) {
        throw new HttpException(
          { error: "endpoint, p256dh, and auth are required" },
          400,
        );
      }
      const subscription = await this.prisma.push_subscriptions.upsert({
        where: { endpoint },
        create: {
          user_id: user.id,
          pharmacy_id: await this.tenant.requirePharmacyId(user.id),
          endpoint,
          p256dh,
          auth,
          user_agent: request.headers["user-agent"] ?? null,
        },
        update: {
          user_id: user.id,
          pharmacy_id: await this.tenant.requirePharmacyId(user.id),
          p256dh,
          auth,
          user_agent: request.headers["user-agent"] ?? null,
          updated_at: new Date(),
        },
      });
      return {
        success: true,
        subscription: {
          id: subscription.id,
          endpoint: subscription.endpoint,
          updatedAt: subscription.updated_at,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("POST /api/notifications/push-subscriptions", error);
      throw new HttpException({ error: "Failed to save push subscription" }, 500);
    }
  }

  @Delete("push-subscriptions")
  @ApiOperation({ summary: "Delete a push subscription", description: "Deletes the authenticated user's push subscription matching the supplied endpoint." })
  @ApiBody({ required: true, description: "Push endpoint to unregister.", type: DeletePushSubscriptionDto })
  @ApiOkResponse({ description: "Deletion was attempted. `success` is false when no matching user subscription existed.", type: DeletePushSubscriptionResponseDto })
  @ApiResponse({ status: 400, description: "The endpoint is missing.", type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: "The session cookie is missing or invalid.", type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: "The authenticated user cannot manage push subscriptions.", type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: "No matching subscription exists. The current idempotent handler reports this as `success: false` with status 200.", type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: "The push subscription could not be deleted.", type: ErrorResponseDto })
  async deletePush(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const endpoint = String(body.endpoint ?? "").trim();
      if (!endpoint) {
        throw new HttpException({ error: "endpoint is required" }, 400);
      }
      const result = await this.prisma.push_subscriptions.deleteMany({
        where: { endpoint, user_id: user.id },
      });
      return { success: result.count > 0 };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("DELETE /api/notifications/push-subscriptions", error);
      throw new HttpException({ error: "Failed to delete push subscription" }, 500);
    }
  }

  private toApi(prefs: NotificationPrefs) {
    return {
      dailyUpdate: prefs.dailyUpdate,
      lowStock: prefs.lowStock,
      expiry: prefs.expiry,
      salesReports: prefs.salesReports,
      systemUpdates: prefs.systemUpdates,
      email: prefs.channelEmail,
      desktop: prefs.channelInApp,
      push: prefs.channelPush,
    };
  }
}

@ApiTags("Notification Broadcast (Deprecated)")
@Controller("notifications/broadcast")
export class BroadcastController {
  @Get()
  @ApiOperation({ summary: "Get deprecated broadcast endpoint status", description: "Deprecated public endpoint retained only to direct clients to notification listing or SSE streaming.", deprecated: true })
  @ApiResponse({ status: 410, description: "The in-memory broadcast endpoint has been permanently removed.", type: DeprecatedBroadcastResponseDto })
  @ApiResponse({ status: 500, description: "An unexpected server error occurred while returning deprecation guidance.", type: ErrorResponseDto })
  get() {
    throw new HttpException(
      {
        error: "deprecated",
        message: "Use GET /api/notifications or the SSE stream instead.",
      },
      410,
    );
  }

  @Post()
  @HttpCode(410)
  @ApiOperation({ summary: "Post to deprecated broadcast endpoint", description: "Deprecated public endpoint retained only to explain that in-memory broadcasts were replaced by notification events and the outbox worker.", deprecated: true })
  @ApiBody({ required: false, description: "Ignored legacy broadcast payload. No fields are read or processed.", schema: { type: "object", additionalProperties: true, description: "Any legacy JSON object.", example: { title: "Legacy broadcast", message: "This payload is ignored." } } })
  @ApiResponse({ status: 410, description: "The in-memory broadcast endpoint has been permanently removed.", type: DeprecatedBroadcastResponseDto })
  @ApiResponse({ status: 500, description: "An unexpected server error occurred while returning deprecation guidance.", type: ErrorResponseDto })
  post() {
    return {
      error: "deprecated",
      message:
        "In-memory broadcast was removed. Use emitNotificationEvent() and the notification outbox worker.",
    };
  }
}
