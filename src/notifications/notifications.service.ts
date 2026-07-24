import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { NotificationPrefs, NotificationRow } from "./models";

export type { NotificationPrefs } from "./models";

const DEFAULT_PREFS: NotificationPrefs = {
  channelInApp: true,
  channelEmail: true,
  channelPush: false,
  dailyUpdate: true,
  lowStock: true,
  expiry: true,
  salesReports: false,
  systemUpdates: true,
  subscriptionRenewalDays: [14, 7, 3, 1],
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async isPlatformAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.public_users.findUnique({
      where: { id: userId },
      select: { is_platform_admin: true },
    });
    return user?.is_platform_admin === true;
  }

  list(pharmacyId: string | null, since?: Date) {
    return this.prisma.notifications.findMany({
      where: {
        pharmacy_id: pharmacyId,
        ...(since ? { created_at: { gt: since } } : {}),
      },
      orderBy: { created_at: since ? "asc" : "desc" },
      take: since ? 20 : 50,
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
  }

  format(row: NotificationRow) {
    return {
      id: row.id,
      title: row.title,
      message: row.message,
      type: row.type,
      read: row.is_read,
      date: row.created_at,
      actionUrl: row.action_url,
    };
  }

  async getPrefs(userId: string, pharmacyId: string): Promise<NotificationPrefs> {
    const row = await this.prisma.notification_preferences.findFirst({
      where: { user_id: userId, pharmacy_id: pharmacyId },
    });
    if (!row) return DEFAULT_PREFS;
    const event =
      row.event_prefs &&
      typeof row.event_prefs === "object" &&
      !Array.isArray(row.event_prefs)
        ? (row.event_prefs as Record<string, unknown>)
        : {};
    return {
      channelInApp: row.channel_in_app,
      channelEmail: row.channel_email,
      channelPush: row.channel_push,
      dailyUpdate: typeof event.dailyUpdate === "boolean" ? event.dailyUpdate : true,
      lowStock: typeof event.lowStock === "boolean" ? event.lowStock : true,
      expiry: typeof event.expiry === "boolean" ? event.expiry : true,
      salesReports:
        typeof event.salesReports === "boolean" ? event.salesReports : false,
      systemUpdates:
        typeof event.systemUpdates === "boolean" ? event.systemUpdates : true,
      subscriptionRenewalDays: normalizeRenewalDays(event.subscriptionRenewalDays),
    };
  }

  savePrefs(userId: string, pharmacyId: string, prefs: NotificationPrefs) {
    const eventPrefs = {
      dailyUpdate: prefs.dailyUpdate,
      lowStock: prefs.lowStock,
      expiry: prefs.expiry,
      salesReports: prefs.salesReports,
      systemUpdates: prefs.systemUpdates,
      subscriptionRenewalDays: prefs.subscriptionRenewalDays,
    };
    return this.prisma.notification_preferences.upsert({
      where: { user_id_pharmacy_id: { user_id: userId, pharmacy_id: pharmacyId } },
      create: {
        user_id: userId,
        pharmacy_id: pharmacyId,
        channel_in_app: prefs.channelInApp,
        channel_email: prefs.channelEmail,
        channel_push: prefs.channelPush,
        event_prefs: eventPrefs,
      },
      update: {
        channel_in_app: prefs.channelInApp,
        channel_email: prefs.channelEmail,
        channel_push: prefs.channelPush,
        event_prefs: eventPrefs,
        updated_at: new Date(),
      },
    });
  }
}

function normalizeRenewalDays(value: unknown): number[] {
  if (!Array.isArray(value)) return [14, 7, 3, 1];
  const days = value
    .filter((day): day is number => typeof day === "number" && Number.isInteger(day))
    .filter((day) => day >= 1 && day <= 30);
  return [...new Set(days)].sort((a, b) => b - a);
}
