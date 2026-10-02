import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// One in-app notification for one person (MDRS-167, screen tedris/36). The
// row holds no sentence: `type` and `params` are what the web app renders in
// the reader's own language, so a notification written today still reads right
// after a translation changes. `user_id` is the Keycloak `sub` and, like every
// other user column, not a foreign key. `target_type` / `target_id` say where
// the notification leads; both are null when it leads nowhere.
//
// `created_at` is written by the application at millisecond precision (see
// `NotificationRepository.insert`): the list is paged on `(created_at, id)`
// and the cursor travels as a JavaScript Date, so a microsecond default would
// make a row compare unequal to its own cursor.
export const notifications = table(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    type: text("type").notNull(),
    targetType: text("target_type"),
    targetId: uuid("target_id"),
    params: jsonb("params")
      .$type<Record<string, string | number | boolean | null>>()
      .default({})
      .notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // The list: one person's rows, newest first, paged on (created_at, id).
    index("notifications_user_created_idx").on(
      t.userId,
      t.createdAt.desc(),
      t.id.desc()
    ),
    // The bell's count and the "unread" tab touch only the unread rows.
    index("notifications_user_unread_idx")
      .on(t.userId)
      .where(sql`${t.readAt} is null`),
  ]
);
