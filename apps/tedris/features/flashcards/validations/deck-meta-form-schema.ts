import { z } from "zod";
import type { FieldMessages } from "./field-messages";

// Mirrors CreateFlashcardDeckDto in tedrisat: title 5..100, description
// 10..1000. The bounds used to be 2..50 and 10..50, so the form accepted a
// title the API rejects with a 400 the dialog reports as a bare
// "creation error", and refused a description the API allows.
//
// One deliberate divergence: the DTO marks `description` @IsOptional(), this
// form requires it. A deck with no description is something the API would
// accept and this screen will not offer.
export const createDeckMetaFormSchema = (messages: FieldMessages) =>
  z.object({
    title: z
      .string()
      .min(5, { message: messages.min(5) })
      .max(100, { message: messages.max(100) }),
    description: z
      .string()
      .min(10, { message: messages.min(10) })
      .max(1000, { message: messages.max(1000) }),
    isPublic: z.boolean(),
  });

export type DeckMetaFormValues = z.infer<
  ReturnType<typeof createDeckMetaFormSchema>
>;
