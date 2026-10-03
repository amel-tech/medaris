import {
  index,
  pgTable as table,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const KOSK_APPLICATION_FIELDS = [
  "ARABIC_LANGUAGE_SCIENCES",
  "RHETORIC",
  "FIQH",
  "USUL_AL_FIQH",
  "HADITH",
  "QURAN_SCIENCES",
  "TAFSIR",
  "AQEEDAH_KALAM",
  "SEERAH",
  "LOGIC",
  "OTHER",
] as const;
export type KoskApplicationField = (typeof KOSK_APPLICATION_FIELDS)[number];

export const KOSK_APPLICATION_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;
export type KoskApplicationStatus = (typeof KOSK_APPLICATION_STATUSES)[number];

// A request to open a new köşk (MDRS-166, screen tedris/37). Medaris
// management answers it on nizam/15 (MDRS-181): `status` moves from PENDING to
// APPROVED or REJECTED exactly once.
// `applicant_id` is the Keycloak `sub`, not a foreign key. `email` is what the
// applicant typed (the form pre-fills it from the account), not the account's.
export const koskApplications = table(
  "kosk_applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    applicantId: uuid("applicant_id").notNull(),
    name: text("name").notNull(),
    field: text("field").notNull(),
    summary: text("summary").notNull(),
    reason: text("reason").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    status: text("status").default("PENDING").notNull(),
    // The answer (MDRS-181, nizam/15): who gave it and when, the reason a
    // refusal carries, and the köşk an approval opened. Not foreign keys: the
    // row is the record of the decision and outlives a hidden or deleted köşk.
    decidedBy: uuid("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    rejectReason: text("reject_reason"),
    koskId: uuid("kosk_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("kosk_applications_applicant_idx").on(t.applicantId, t.createdAt),
    index("kosk_applications_status_idx").on(t.status, t.createdAt),
  ]
);
