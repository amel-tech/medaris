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
import { madrasahs } from "./madrasah.schema";

// Köşk = publisher / school that owns courses.
export const kosks = table("kosks", {
  id: uuid("id").primaryKey().defaultRandom(),
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

export const kosksRelations = relations(kosks, ({ many, one }) => ({
  madrasah: one(madrasahs, {
    fields: [kosks.madrasahId],
    references: [madrasahs.id],
  }),
  courses: many(courses),
  followers: many(koskFollowers),
}));

export const koskFollowersRelations = relations(koskFollowers, ({ one }) => ({
  kosk: one(kosks, {
    fields: [koskFollowers.koskId],
    references: [kosks.id],
  }),
}));
