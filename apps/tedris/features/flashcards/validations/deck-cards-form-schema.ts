import { z } from "zod";
import type { FieldMessages } from "./field-messages";

export const createDeckCardsFormSchema = (messages: FieldMessages) =>
  z.object({
    cards: z.array(
      z.object({
        content: z.object({
          front: z
            .string()
            .min(1, { message: messages.min(1) })
            .max(1000, { message: messages.max(1000) }),
          back: z
            .string()
            .min(1, { message: messages.min(1) })
            .max(1000, { message: messages.max(1000) }),
        }),
      })
    ),
  });

export type DeckCardsFormValues = z.infer<
  ReturnType<typeof createDeckCardsFormSchema>
>;
