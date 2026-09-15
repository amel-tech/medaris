import { z } from "zod";

// Mirrors CreateFlashcardDto in tedrisat: both faces are required strings of
// 3..5000 characters. Keeping the bounds here turns a 400 into inline feedback.
export const flashcardFormSchema = z.object({
  contentFront: z.string().min(3).max(5000),
  contentBack: z.string().min(3).max(5000),
});
