import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  primaryKey,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { kosks } from "./kosk.schema";

/**
 * The partner applications whose registrations become course enrollments
 * (partner enrollments), as the başnazım registers them in nizam ("Ortak
 * uygulamalar"). `client_id` is the partner's Keycloak client id, what its
 * tokens carry in `azp`; `partner_course_codes.partner_client_id` and
 * `partner_enrollment_links.partner_client_id` name it too, without a foreign
 * key: those rows predate this table, made while `INTEGRATION_PARTNERS` was
 * the registry, and a partner is never deleted, only disabled.
 *
 * A registered partner's token is refused on every route but
 * `/integrations/*`, enabled or not; a disabled one is refused there too. The
 * row is never deleted through the API.
 *
 * `created_by` is null for a partner seeded at boot from
 * `INTEGRATION_PARTNERS`, the registry this table replaced: nobody added it.
 */
export const integrationPartners = table(
  "integration_partners",
  {
    clientId: text("client_id").primaryKey(),
    // What nazar, nizam and the audit log call it.
    name: text("name").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // A user column like every other one, no foreign key.
    createdBy: uuid("created_by"),
  },
  (t) => [
    check(
      "integration_partners_name_length",
      sql`char_length(${t.name}) between 1 and 100`
    ),
  ]
);

/**
 * The köşks a partner application works with. Its codes are mapped, listed
 * and honoured only in courses of these köşks: nazar's Ders ayarları offers a
 * course's köşk's partners alone, and a PUT for a code in any other köşk is
 * answered as an unknown code.
 *
 * CASCADE on the köşk, as the köşk's other rows that are no content of it
 * (followers, hosting rights, course requests): a köşk deleted for real takes
 * its bindings with it. CASCADE on the partner as well, though nothing deletes
 * a partner but a person at the database.
 */
export const integrationPartnerKosks = table(
  "integration_partner_kosks",
  {
    clientId: text("client_id").notNull(),
    koskId: uuid("kosk_id")
      .references(() => kosks.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Null for a binding seeded at boot from the codes a partner already had.
    createdBy: uuid("created_by"),
  },
  (t) => [
    primaryKey({ columns: [t.clientId, t.koskId] }),
    // Named by hand: the generated name is longer than Postgres's 63.
    foreignKey({
      name: "integration_partner_kosks_client_id_fk",
      columns: [t.clientId],
      foreignColumns: [integrationPartners.clientId],
    }).onDelete("cascade"),
    // "The partners of this köşk", the course settings' read.
    index("integration_partner_kosks_kosk_id_idx").on(t.koskId),
  ]
);
