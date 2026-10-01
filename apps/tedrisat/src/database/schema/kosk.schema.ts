import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  primaryKey,
  real,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { courses } from "./course.schema";
import { madrasahs } from "./madrasah.schema";

// Köşk = publisher / school that owns courses.
export const kosks = table("kosks", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Who created the köşk. Since MDRS-126 it grants nothing: who manages a
  // köşk is `kosk_managers`, which migration 0021 seeded from this column.
  ownerId: uuid("owner_id").notNull(),
  // The medrese this köşk is affiliated with, if any (MDRS-106). A köşk may
  // stand alone; deleting its medrese makes it stand alone again.
  madrasahId: uuid("madrasah_id").references(() => madrasahs.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  handle: text("handle"),
  description: text("description"),
  coverHue: integer("cover_hue").default(215).notNull(),
  isPrivate: boolean("is_private").default(true).notNull(),
  // Discovery metadata (surfaced on the köşk list / detail).
  field: text("field"), // ilim alanı, e.g. "Tefsir & Hadis"
  level: text("level"), // 'ALL' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  tags: text("tags").array().default([]).notNull(),
  verified: boolean("verified").default(false).notNull(),
  featured: boolean("featured").default(false).notNull(),
  rating: real("rating").default(0).notNull(),
  ratingCount: integer("rating_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Talebe ↔ köşk follow relationship.
export const koskFollowers = table(
  "kosk_followers",
  {
    userId: uuid("user_id").notNull(),
    koskId: uuid("kosk_id")
      .references(() => kosks.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.koskId] })]
);

// Who manages a köşk (MDRS-126) — the same shape as `madrasah_nazirs`. A köşk
// always has at least one: `create` adds its creator, and removing the last
// one is refused. `user_id` is not a foreign key, for the reason `madrasahs`
// gives for `created_by`: users rows are written lazily on sign-in.
export const koskManagers = table(
  "kosk_managers",
  {
    koskId: uuid("kosk_id")
      .references(() => kosks.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id").notNull(),
    // Who added this manager; for the rows 0021 seeded, the köşk's creator.
    addedBy: uuid("added_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.koskId, t.userId] }),
    // "Which köşks does this user manage" — `GET /me`, the calendar feed.
    index("kosk_managers_user_id_idx").on(t.userId),
  ]
);

export const kosksRelations = relations(kosks, ({ many, one }) => ({
  madrasah: one(madrasahs, {
    fields: [kosks.madrasahId],
    references: [madrasahs.id],
  }),
  courses: many(courses),
  followers: many(koskFollowers),
  managers: many(koskManagers),
}));

export const koskManagersRelations = relations(koskManagers, ({ one }) => ({
  kosk: one(kosks, {
    fields: [koskManagers.koskId],
    references: [kosks.id],
  }),
}));

export const koskFollowersRelations = relations(koskFollowers, ({ one }) => ({
  kosk: one(kosks, {
    fields: [koskFollowers.koskId],
    references: [kosks.id],
  }),
}));
