import {
  createServerTedrisatAPIs,
  type DashboardSessionTab,
  type GrantResponse,
  type KoskDashboardResponse,
  type NizamDashboardResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

/**
 * Server-side reads of the home pages (MDRS-182, nizam 01, 02 and 05). Not a
 * `"use server"` module: only server components call them. A failed read is
 * `null` so the page can show its error state and a retry instead of a crash;
 * a refusal is told apart so the page can show "Bu bölüm için izniniz yok"
 * (nizam/06).
 */
const api = async () =>
  createServerTedrisatAPIs(await getAccessToken(), env.TEDRISAT_API_BASE_URL);

export type DashboardRead<T> = T | "forbidden" | "not-found" | null;

const refusal = (error: unknown): "forbidden" | "not-found" | null => {
  if (!(error instanceof ResponseError)) return null;
  if (error.response.status === 403) return "forbidden";
  if (error.response.status === 404) return "not-found";
  return null;
};

async function read<T>(
  what: string,
  call: (client: Awaited<ReturnType<typeof api>>) => Promise<T>
): Promise<DashboardRead<T>> {
  try {
    return await call(await api());
  } catch (error) {
    const refused = refusal(error);
    if (refused) return refused;
    console.error(`Error fetching ${what}:`, error);
    return null;
  }
}

export const getNizamDashboard = (): Promise<
  DashboardRead<NizamDashboardResponse>
> => read("the Medaris home page", (c) => c.nizam.getNizamDashboard());

export const getKoskDashboard = (
  koskId: string,
  sessions: DashboardSessionTab = "UPCOMING"
): Promise<DashboardRead<KoskDashboardResponse>> =>
  read("the köşk home page", (c) =>
    c.kosks.getKoskDashboard({ id: koskId, sessions })
  );

/** What the başnazım gave the viewer ("İzinleriniz"); null when it cannot be read. */
export const getMyGrants = async (): Promise<GrantResponse[] | null> => {
  const grants = await read("the caller's grants", (c) => c.me.getMyGrants());
  return grants && typeof grants === "object" && "grants" in grants
    ? grants.grants
    : null;
};
