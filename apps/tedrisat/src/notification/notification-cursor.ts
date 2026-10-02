import { InvalidNotificationCursorError } from "./errors/invalid-notification-cursor.error";

/** A position in the list: the last row of the previous page. */
export interface NotificationCursor {
  createdAt: Date;
  id: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opaque to clients: base64url of `<epoch ms>.<id>`. */
export const encodeNotificationCursor = (cursor: NotificationCursor): string =>
  Buffer.from(`${cursor.createdAt.getTime()}.${cursor.id}`, "utf8").toString(
    "base64url"
  );

export const decodeNotificationCursor = (raw: string): NotificationCursor => {
  const text = Buffer.from(raw, "base64url").toString("utf8");
  const dot = text.indexOf(".");
  const millis = Number(text.slice(0, dot));
  const id = text.slice(dot + 1);
  if (dot < 1 || !Number.isSafeInteger(millis) || !UUID_REGEX.test(id)) {
    throw new InvalidNotificationCursorError();
  }
  const createdAt = new Date(millis);
  if (Number.isNaN(createdAt.getTime())) {
    throw new InvalidNotificationCursorError();
  }
  return { createdAt, id };
};
