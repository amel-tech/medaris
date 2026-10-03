import {
  integer,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Medrese = the optional top layer of the hierarchy (PRD §4.1, ADR-003). It
// lives in tedrisat, beside `kosks` and the authorization resolver, until a
// separate decision moves it to teskilat (MDRS-106).
//
// Since MDRS-134 it has no link to a köşk except a hosting right
// (`madrasah_kosk_hosting`), and who governs it is `role_assignments`
// (MEDRESE_BASMUDERRIS, MEDRESE_NAZIR) — `madrasah_nazirs` is gone.
export const madrasahs = table("madrasahs", {
  id: uuid("id").primaryKey().defaultRandom(),
  handle: text("handle").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  coverHue: integer("cover_hue").default(215).notNull(),
  // The SYSTEM_ADMIN who opened it. Not a foreign key: users rows are
  // written lazily on sign-in (MDRS-104), like every other user column here.
  createdBy: uuid("created_by").notNull(),
  // Passive (MDRS-134): the medrese lost its last admin and nobody above took
  // it over (MDRS-133, MDRS-136). Not hiding (MDRS-124): nobody hid a
  // passive medrese, it is unattended. Null while active.
  passiveSince: timestamp("passive_since", { withTimezone: true }),
  passiveReason: text("passive_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
