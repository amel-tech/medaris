import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  primaryKey,
  real,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { courses } from "./course.schema";

// Köşk = publisher / school that owns courses.
//
// Who manages a köşk is `role_assignments` (KOSK_NAZIM) since MDRS-134, which
// took over `kosk_managers` (MDRS-126). A medrese has no link to a köşk except
// a hosting right (`madrasah_kosk_hosting`), which replaced
// `kosks.madrasah_id` (MDRS-106).
export const kosks = table("kosks", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Who created the köşk. Since MDRS-126 it grants nothing: migration 0021
  // seeded the köşk's first manager from it.
  ownerId: uuid("owner_id").notNull(),
  name: text("name").notNull(),
  handle: text("handle"),
  description: text("description"),
  coverHue: integer("cover_hue").default(215).notNull(),
  // Unlisted (MDRS-122): in no list or search, opened by its link to signed-in
  // callers only, every enrollment waits for approval. New köşks default to
  // listed since migration 0022; the rows that existed then kept their value.
  isPrivate: boolean("is_private").default(false).notNull(),
  // Discovery metadata (surfaced on the köşk list / detail).
  field: text("field"), // ilim alanı, e.g. "Tefsir & Hadis"
  level: text("level"), // 'ALL' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  tags: text("tags").array().default([]).notNull(),
  // Köşk-wide policies (MDRS-174, nizam/24): they apply to every course of
  // the köşk and a course's own setting cannot loosen them. Approval is
  // enforced at enrollment; the recordings policy is stored for the recording
  // model to read (there is none yet).
  alwaysRequireApproval: boolean("always_require_approval")
    .default(false)
    .notNull(),
  recordingsNeverPublic: boolean("recordings_never_public")
    .default(false)
    .notNull(),
  verified: boolean("verified").default(false).notNull(),
  featured: boolean("featured").default(false).notNull(),
  rating: real("rating").default(0).notNull(),
  ratingCount: integer("rating_count").default(0).notNull(),
  // Passive (MDRS-134): the köşk lost its last admin and nobody above took
  // it over (MDRS-133, MDRS-136). Not hiding (MDRS-124): nobody hid a
  // passive köşk, it is unattended. Null while active.
  passiveSince: timestamp("passive_since", { withTimezone: true }),
  passiveReason: text("passive_reason"),
  // Hidden (MDRS-173): nothing is deleted, the platform archive lists it and
  // the same people can bring it back. `archivedBy` is the account that hid
  // it — not a foreign key, like every other user column. Null while shown.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  archivedBy: uuid("archived_by"),
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

export const kosksRelations = relations(kosks, ({ many }) => ({
  courses: many(courses),
  followers: many(koskFollowers),
}));

export const koskFollowersRelations = relations(koskFollowers, ({ one }) => ({
  kosk: one(kosks, {
    fields: [koskFollowers.koskId],
    references: [kosks.id],
  }),
}));
