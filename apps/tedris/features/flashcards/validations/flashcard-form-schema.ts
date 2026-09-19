import { z } from "zod";
import type { FieldMessages } from "./field-messages";

// Mirrors CreateFlashcardDto in tedrisat: both faces are required strings of
// 3..5000 characters. Keeping the bounds here turns a 400 into inline feedback.
export const createFlashcardFormSchema = (messages: FieldMessages) =>
  z.object({
    contentFront: z
      .string()
      .min(3, { message: messages.min(3) })
      .max(5000, { message: messages.max(5000) }),
    contentBack: z
      .string()
      .min(3, { message: messages.min(3) })
      .max(5000, { message: messages.max(5000) }),
  });

export type FlashcardFormValues = z.infer<
  ReturnType<typeof createFlashcardFormSchema>
>;
