export * from "./course.schema";
// Re-exported so drizzle.config.ts's `./src/database/schema/*` glob keeps seeing
// the `examples` table — see example.schema.ts for why it outlives its module.
export * from "./example.schema";
export * from "./flashcard.schema";
export * from "./flashcard-deck.schema";
export * from "./flashcard-deck-label.schema";
export * from "./flashcard-label.schema";
export * from "./kosk.schema";
