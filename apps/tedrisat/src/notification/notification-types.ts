/**
 * What happened, as the web app words it (MDRS-167, screen tedris/36). The
 * stored row carries this key and its `params`, never a sentence, so each
 * reader sees it in their own language.
 *
 * The producers of most of these events do not exist yet: only the
 * notification model and its reads ship with MDRS-167. A producer calls
 * `NotificationService.notify` with one of these.
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
