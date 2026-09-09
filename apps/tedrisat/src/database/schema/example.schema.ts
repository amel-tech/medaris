// MDRS-32 removed the example module, its controller and its routes; this table
// declaration deliberately stayed. Deleting it would take `examples` out of the
// schema of record while `0000_chunky_viper.sql` still creates it and every
// `meta/*_snapshot.json` still lists it — and the next `drizzle-kit generate`,
// run for something unrelated, would then fold `DROP TABLE "examples"` into that
// unrelated migration. Nothing in `src/` imports this any more; it exists only so
// the schema and the migration history keep saying the same thing. Delete it
// together with the drop migration, not before. See
// docs/migration/mdrs-32-example-module-removal.md follow-up #1.
import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const examples = pgTable("examples", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Example = InferSelectModel<typeof examples>;
export type NewExample = InferInsertModel<typeof examples>;
