/** Per-user notification event and delivery-channel preferences. */
export type NotificationPrefs = {
  channelInApp: boolean;
  channelEmail: boolean;
  channelPush: boolean;
  dailyUpdate: boolean;
  lowStock: boolean;
  expiry: boolean;
  salesReports: boolean;
  systemUpdates: boolean;
  subscriptionRenewalDays: number[];
};

/** Notification row as selected from the database. */
export type NotificationRow = {
  id: string;
  title: string;
  message: string;
  type: string | null;
  is_read: boolean | null;
  created_at: Date | null;
  action_url: string | null;
};
