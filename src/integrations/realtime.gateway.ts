import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { Logger } from "@nestjs/common";
import { AppConfigService } from "../config/app-config.service";
import { SessionTokenService } from "../auth/session-token.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenant/tenant-context.service";
import { RealtimeService } from "./realtime.service";

type ConnectionContext = {
  userId: string;
  pharmacyId: string;
};

@WebSocketGateway({
  namespace: "/realtime",
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly sockets = new Map<string, ConnectionContext>();
  private readonly pharmacySockets = new Map<string, Set<string>>();
  private readonly pharmacyCursor = new Map<string, Date>();
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly sessionTokens: SessionTokenService,
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server) {
    this.logger.log(`WebSocket gateway initialized on namespace /realtime`);
  }

  async handleConnection(client: Socket): Promise<void> {
    this.logger.log(`Client attempting connection: ${client.id} from ${client.handshake.address}`);
    try {
      const token = this.extractSessionCookie(client);
      if (!token) {
        this.logger.warn(`WS rejected ${client.id} — no session cookie`);
        client.disconnect(true);
        return;
      }

      const payload = await this.sessionTokens.verifyAccessToken(token);
      if (!payload?.sub) {
        this.logger.warn(`WS rejected ${client.id} — invalid/expired token`);
        client.disconnect(true);
        return;
      }

      const user = await this.prisma.auth_users.findUnique({
        where: { id: payload.sub },
        select: { id: true },
      });
      if (!user) {
        this.logger.warn(`WS rejected ${client.id} — user not found`);
        client.disconnect(true);
        return;
      }

      const profile = await this.prisma.public_users.findUnique({
        where: { id: user.id },
        select: { is_platform_admin: true },
      });
      const isPlatformAdmin = profile?.is_platform_admin === true;

      const pharmacyId = await this.tenant.resolvePharmacyId(user.id);
      if (!pharmacyId && !isPlatformAdmin) {
        this.logger.warn(`WS rejected ${client.id} — no pharmacy for user ${user.id}`);
        client.disconnect(true);
        return;
      }

      if (pharmacyId) {
        const room = this.roomForPharmacy(pharmacyId);
        await client.join(room);
      }

      this.sockets.set(client.id, { userId: user.id, pharmacyId: pharmacyId ?? "" });

      if (pharmacyId) {
        const socketIds = this.pharmacySockets.get(pharmacyId) ?? new Set<string>();
        socketIds.add(client.id);
        this.pharmacySockets.set(pharmacyId, socketIds);

        if (!this.pharmacyCursor.has(pharmacyId)) {
          this.pharmacyCursor.set(pharmacyId, new Date());
        }

        this.ensurePollLoop();
      }
      this.logger.log(`WS connected: ${client.id} → userId=${user.id} pharmacyId=${pharmacyId}`);
      client.emit("realtime:connected", {
        mode: "websocket",
        pharmacyId,
      });
    } catch (err) {
      this.logger.error(`WS connection error for ${client.id}:`, err);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const context = this.sockets.get(client.id);
    this.logger.log(`WS disconnected: ${client.id}${context ? ` (userId=${context.userId})` : ""}`);
    if (!context) return;

    this.sockets.delete(client.id);
    const socketIds = this.pharmacySockets.get(context.pharmacyId);
    if (!socketIds) return;

    socketIds.delete(client.id);
    if (!socketIds.size) {
      this.pharmacySockets.delete(context.pharmacyId);
      this.pharmacyCursor.delete(context.pharmacyId);
    }

    if (!this.pharmacySockets.size && this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private ensurePollLoop(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      void this.pollAndBroadcast();
    }, 15_000); // 15s — reduces DB connection pressure on Supabase pooler
  }

  private async pollAndBroadcast(): Promise<void> {
    for (const [pharmacyId, socketIds] of this.pharmacySockets.entries()) {
      if (!socketIds.size) continue;

      const since = this.pharmacyCursor.get(pharmacyId) ?? new Date();
      try {
        const { updates, cursor } = await this.realtime.getUpdatesSince(
          pharmacyId,
          since,
        );
        this.pharmacyCursor.set(pharmacyId, cursor);

        if (!updates.length) continue;
        this.server.to(this.roomForPharmacy(pharmacyId)).emit("realtime:update", {
          updates,
        });
      } catch {
        // Keep the gateway resilient; next poll cycle can recover.
      }
    }
  }

  private extractSessionCookie(client: Socket): string | null {
    const rawCookie = client.handshake.headers.cookie;
    if (!rawCookie) return null;

    const cookies = this.parseCookieHeader(rawCookie);
    const value = cookies[this.appConfig.sessionCookieName];
    return typeof value === "string" && value.length ? value : null;
  }

  private parseCookieHeader(cookieHeader: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const part of cookieHeader.split(";")) {
      const [key, ...rest] = part.trim().split("=");
      if (!key || !rest.length) continue;
      out[key] = decodeURIComponent(rest.join("="));
    }
    return out;
  }

  private roomForPharmacy(pharmacyId: string): string {
    return `pharmacy:${pharmacyId}`;
  }

  /** Called by BillingModule when a plan change activates — tells the pharmacy's
   *  connected clients to re-fetch their entitlements immediately. */
  broadcastEntitlementsChanged(pharmacyId: string): void {
    this.server
      .to(this.roomForPharmacy(pharmacyId))
      .emit("realtime:entitlements_updated", { pharmacyId });
    this.logger.log(`Broadcasted entitlements_updated to pharmacy ${pharmacyId}`);
  }
}
