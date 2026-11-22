import {
  ResponseError,
  type ZerothAnswerCountsResponse,
  type ZerothQuestionExamsResponse,
} from "@medaris/services/tedrisat";
import { passOnSignIn, tedrisatApi } from "~/lib/tedrisat-api";
import { type ZerothFilters, zerothApiQuery } from "./present";

/**
 * Server-side reads of Sıfırıncı soru cevapları (MDRS-299). Not a
 * `"use server"` module: only server components call them. A failed read is
 * `null` so the page can say it could not be read; a refusal is told apart so
 * the page shows "Bu bölüm için izniniz yok", and a question no exam of the
 * span asks any more is "gone".
 */
export type ZerothRead<T> = T | "forbidden" | "gone" | null;

async function read<T>(
  what: string,
  call: () => Promise<T>
): Promise<ZerothRead<T>> {
  try {
    return await call();
  } catch (error) {
    await passOnSignIn(error);
    if (error instanceof ResponseError) {
      if (error.response.status === 403) return "forbidden";
      if (error.response.status === 404) return "gone";
    }
    console.error(`Error fetching ${what}:`, error);
    return null;
  }
}

/** The list; `koskId` is the page's köşk when it is a köşk nazımı's. */
export const getZerothAnswerCounts = (
  filters: ZerothFilters,
  koskId?: string
): Promise<ZerothRead<ZerothAnswerCountsResponse>> =>
  read("the zeroth answers", async () =>
    (await tedrisatApi()).nizam.listZerothAnswerCounts(
      zerothApiQuery(filters, koskId)
    )
  );

/** One question's exams, under the same filters. */
export const getZerothQuestionExams = (
  questionKey: string,
  filters: ZerothFilters,
  koskId?: string
): Promise<ZerothRead<ZerothQuestionExamsResponse>> =>
  read("a zeroth question's exams", async () =>
    (await tedrisatApi()).nizam.getZerothQuestionExams({
      questionKey,
      ...zerothApiQuery(filters, koskId),
    })
  );
