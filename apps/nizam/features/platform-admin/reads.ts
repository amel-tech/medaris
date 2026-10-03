import {
  type AuditPageResponse,
  type CourseRequestListResponse,
  createServerTedrisatAPIs,
  type KoskApplicationListResponse,
  type PlatformPolicyListResponse,
  ResponseError,
  type ScopedPolicyListResponse,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";
import { type AuditFilters, auditApiQuery } from "./present";

/**
 * Server-side first reads of the platform screens (MDRS-181). Not a
 * `"use server"` module: only server components call them. A failed read is
 * `null` so the page can show its error state instead of a crash; a refusal is
 * told apart so the page can show "Bu bölüm için izniniz yok" (nizam/06).
 */
const api = async () =>
  createServerTedrisatAPIs(await getAccessToken(), env.TEDRISAT_API_BASE_URL);

export type PlatformRead<T> = T | "forbidden" | "not-found" | null;

const refusal = (error: unknown): "forbidden" | "not-found" | null => {
  if (!(error instanceof ResponseError)) return null;
  if (error.response.status === 403) return "forbidden";
  if (error.response.status === 404) return "not-found";
  return null;
};

async function read<T>(
  what: string,
  call: (client: Awaited<ReturnType<typeof api>>) => Promise<T>
): Promise<PlatformRead<T>> {
  try {
    return await call(await api());
  } catch (error) {
    const refused = refusal(error);
    if (refused) return refused;
    console.error(`Error fetching ${what}:`, error);
    return null;
  }
}

export const getPendingKoskApplications = (): Promise<
  PlatformRead<KoskApplicationListResponse>
> =>
  read("the köşk applications", (c) =>
    c.nizam.listKoskApplications({ status: "PENDING" })
  );

export const getAuditPage = (
  filters: AuditFilters
): Promise<PlatformRead<AuditPageResponse>> =>
  read("the audit log", (c) => c.nizam.listAuditLog(auditApiQuery(filters)));

export const getPlatformSettings = async (): Promise<
  PlatformRead<{
    policies: PlatformPolicyListResponse;
    scoped: ScopedPolicyListResponse;
  }>
> =>
  read("the platform settings", async (c) => {
    const [policies, scoped] = await Promise.all([
      c.nizam.listPlatformPolicies(),
      c.nizam.listScopedPolicies(),
    ]);
    return { policies, scoped };
  });

export const getPendingCourseRequests = (
  koskId: string
): Promise<PlatformRead<CourseRequestListResponse>> =>
  read("the course requests", (c) =>
    c.kosks.listCourseRequests({ id: koskId, status: "PENDING" })
  );

export const getKoskName = (
  koskId: string
): Promise<PlatformRead<{ id: string; name: string }>> =>
  read("the köşk", async (c) => {
    const kosk = await c.kosks.getKoskById({ id: koskId });
    return { id: kosk.id, name: kosk.name };
  });
