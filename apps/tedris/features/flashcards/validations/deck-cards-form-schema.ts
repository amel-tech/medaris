import { z } from "zod";
import type { FieldMessages } from "./field-messages";

// Mirrors CreateFlashcardDto in tedrisat: both faces are required strings of
// 3..5000 characters. The bounds used to be 1..1000, which is inert only
// because DeckForm's submit is still a stub — it becomes a 400 the moment that
// is wired up.
export const createDeckCardsFormSchema = (messages: FieldMessages) =>
  z.object({
    cards: z.array(
      z.object({
        content: z.object({
          front: z
            .string()
            .min(3, { message: messages.min(3) })
            .max(5000, { message: messages.max(5000) }),
          back: z
            .string()
            .min(3, { message: messages.min(3) })
            .max(5000, { message: messages.max(5000) }),
        }),
      })
    ),
  });

export type DeckCardsFormValues = z.infer<
  ReturnType<typeof createDeckCardsFormSchema>
>;
