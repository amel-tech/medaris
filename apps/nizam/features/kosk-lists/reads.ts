import {
  type KoskRecordingListResponse,
  type KoskSessionListResponse,
  type KoskStudentListResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import {
  passOnSignIn,
  type TedrisatApi,
  tedrisatApi,
} from "~/lib/tedrisat-api";
import { PAGE_SIZE, type SessionTab } from "./present";

/**
 * Server-side reads of the köşk-wide lists (MDRS-211). Not a `"use server"`
 * module: only the pages call them. A failed read is `null` so the page can
 * show its error state instead of a crash; a refusal and a köşk that is not
 * there are told apart so the page can show "Bu bölüm için izniniz yok"
 * (nizam/06) or "Sayfa bulunamadı".
 */
export type KoskListRead<T> = T | "forbidden" | "not-found" | null;

async function read<T>(
  what: string,
  call: (client: TedrisatApi) => Promise<T>
): Promise<KoskListRead<T>> {
  try {
    return await call(await tedrisatApi());
  } catch (error) {
    await passOnSignIn(error);
    if (error instanceof ResponseError) {
      if (error.response.status === 403) return "forbidden";
      if (error.response.status === 404) return "not-found";
    }
    console.error(`Error fetching ${what}:`, error);
    return null;
  }
}

export const getKoskSessions = (
  koskId: string,
  tab: SessionTab,
  page: number
): Promise<KoskListRead<KoskSessionListResponse>> =>
  read("the köşk's sessions", (c) =>
    c.kosks.listKoskSessions({ id: koskId, tab, page, limit: PAGE_SIZE })
  );

export const getKoskStudents = (
  koskId: string,
  q: string,
  page: number
): Promise<KoskListRead<KoskStudentListResponse>> =>
  read("the köşk's talebe", (c) =>
    c.kosks.listKoskStudents({
      id: koskId,
      q: q || undefined,
      page,
      limit: PAGE_SIZE,
    })
  );

export const getKoskRecordings = (
  koskId: string,
  page: number
): Promise<KoskListRead<KoskRecordingListResponse>> =>
  read("the köşk's ders kayıtları", (c) =>
    c.kosks.listKoskRecordings({ id: koskId, page, limit: PAGE_SIZE })
  );
