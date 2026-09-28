import { relations } from "drizzle-orm";
import {
  integer,
  primaryKey,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Medrese = the optional top layer of the hierarchy (PRD §4.1, ADR-003): an
// institution that köşks may affiliate with. It lives in tedrisat, beside
// `kosks` and the authorization resolver, until a separate decision moves it
// to teskilat (MDRS-106).
export const madrasahs = table("madrasahs", {
  id: uuid("id").primaryKey().defaultRandom(),
  handle: text("handle").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  coverHue: integer("cover_hue").default(215).notNull(),
  // The SYSTEM_ADMIN who opened it. Not a foreign key: users rows are
  // written lazily on sign-in (MDRS-104), like every other user column here.
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Who governs a medrese. A nazır has authority over the medrese itself and,
// indirectly, over the köşks affiliated with it — never over their courses.
export const madrasahNazirs = table(
  "madrasah_nazirs",
  {
    madrasahId: uuid("madrasah_id")
      .references(() => madrasahs.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.madrasahId, t.userId] })]
);

export const madrasahsRelations = relations(madrasahs, ({ many }) => ({
  nazirs: many(madrasahNazirs),
}));

export const madrasahNazirsRelations = relations(madrasahNazirs, ({ one }) => ({
  madrasah: one(madrasahs, {
    fields: [madrasahNazirs.madrasahId],
    references: [madrasahs.id],
  }),
}));
