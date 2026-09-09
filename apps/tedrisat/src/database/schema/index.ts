export * from "./course.schema";
// Kept exported so the drizzle-orm client built in database.service.ts still
// carries the `examples` table. drizzle-kit finds it via drizzle.config.ts's
// `./src/database/schema/*` file glob regardless of this line, so dropping the
// re-export alone would take the table out of the runtime schema while
// `drizzle-kit generate` still saw it — the half-state example.schema.ts's
// header guards against. See example.schema.ts for why it outlives its module.
export * from "./example.schema";
export * from "./flashcard.schema";
export * from "./flashcard-deck.schema";
export * from "./flashcard-deck-label.schema";
export * from "./flashcard-label.schema";
export * from "./kosk.schema";
