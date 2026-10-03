/**
 * What happened, as the web app words it (MDRS-167, screen tedris/36). The
 * stored row carries this key and its `params`, never a sentence, so each
 * reader sees it in their own language.
 *
 * A producer calls `NotificationService.notify` with one of these. The
 * course types are written by `CourseNotifier` (MDRS-213) and
 * COURSE_ACCESS_REMOVED by `BanService` when a ban takes a seat. SESSION_ADDED
 * — a lesson recording added, as tedris words it — has no producer yet: no
 * route adds a recording.
 */
export const NOTIFICATION_TYPES = [
  "ENROLLMENT_APPROVED",
  "ENROLLMENT_REJECTED",
  "REMOVED_FROM_COURSE",
  "COURSE_ACCESS_REMOVED",
  "SESSION_RESCHEDULED",
  "SESSION_CANCELLED",
  "SESSION_ADDED",
  "KOSK_APPLICATION_RESULT",
  "DECK_PUBLISH_RESULT",
  // Nizam side (MDRS-179): what a köşk nazımı or Medaris nazımı is told.
  "COURSE_BAN_PLACED",
  "KOSK_BAN_PLACED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** What a notification leads to. */
export const NOTIFICATION_TARGET_TYPES = [
  "COURSE",
  "SESSION",
  "DECK",
  "KOSK",
] as const;
export type NotificationTargetType = (typeof NOTIFICATION_TARGET_TYPES)[number];

/** The values a notification's sentence is filled from. Flat on purpose. */
export type NotificationParams = Record<
  string,
  string | number | boolean | null
>;

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  targetType?: NotificationTargetType | null;
  targetId?: string | null;
  params?: NotificationParams;
}

/**
 * Which stored types the optional `types` filter of `GET /notifications`
 * accepts: any of `NOTIFICATION_TYPES`, comma separated.
 */
export const parseNotificationTypes = (
  raw: string | undefined
): NotificationType[] | null => {
  if (raw === undefined || raw.trim() === "") return [];
  const parts = raw.split(",").map((p) => p.trim());
  return parts.every((p): p is NotificationType =>
    (NOTIFICATION_TYPES as readonly string[]).includes(p)
  )
    ? (parts as NotificationType[])
    : null;
};

/** The two filters of `GET /notifications`. */
export const NOTIFICATION_STATUSES = ["all", "unread"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export interface INotification {
  id: string;
  type: string;
  targetType: string | null;
  targetId: string | null;
  params: NotificationParams;
  readAt: Date | null;
  createdAt: Date;
}
