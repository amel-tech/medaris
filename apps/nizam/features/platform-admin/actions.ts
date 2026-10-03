"use server";

import type {
  AuditPageResponse,
  CourseRequestListResponse,
  KoskApplicationDetailResponse,
  KoskApplicationListResponse,
  PlatformPolicyKey,
  PlatformPolicyListResponse,
} from "@medaris/services/tedrisat";
import { revalidatePath } from "next/cache";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";
import { type AuditFilters, auditApiQuery, type RequestTab } from "./present";

const refresh = <T>(result: AuthenticatedActionResult<T>) => {
  if (result.success) revalidatePath("/", "layout");
  return result;
};

// ---- köşk applications (nizam 15) ---------------------------------------------------

/** One tab of the applications. */
export const loadKoskApplications = async (
  status: RequestTab
): Promise<AuthenticatedActionResult<KoskApplicationListResponse>> =>
  authenticatedAction((api) => api.nizam.listKoskApplications({ status }));

/** The whole application. Reading the applicant's contact details is written to the audit log by tedrisat. */
export const loadKoskApplication = async (
  id: string
): Promise<AuthenticatedActionResult<KoskApplicationDetailResponse>> =>
  authenticatedAction((api) => api.nizam.getKoskApplication({ id }));

/** "Köşkü aç" finished: the application is accepted with the köşk opened from it. */
export const approveKoskApplication = async (
  id: string,
  koskId: string
): Promise<AuthenticatedActionResult<null>> =>
  refresh(
    await authenticatedAction(async (api) => {
      await api.nizam.approveKoskApplication({
        id,
        approveKoskApplicationDto: { koskId },
      });
      return null;
    })
  );

/** "Reddet", with the reason the applicant will read. */
export const rejectKoskApplication = async (
  id: string,
  reason: string
): Promise<AuthenticatedActionResult<null>> =>
  refresh(
    await authenticatedAction(async (api) => {
      await api.nizam.rejectKoskApplication({
        id,
        rejectReasonDto: { reason },
      });
      return null;
    })
  );

// ---- audit log (nizam 17) -----------------------------------------------------------

/** The next, older page of the same filters. */
export const loadAuditPage = async (
  filters: AuditFilters,
  cursor: string
): Promise<AuthenticatedActionResult<AuditPageResponse>> =>
  authenticatedAction((api) =>
    api.nizam.listAuditLog({ ...auditApiQuery(filters), cursor })
  );

// ---- platform settings (nizam 19) ---------------------------------------------------

/** A switch: in force at once and written to the audit log. */
export const setPlatformPolicy = async (
  key: PlatformPolicyKey,
  enabled: boolean
): Promise<AuthenticatedActionResult<PlatformPolicyListResponse>> =>
  refresh(
    await authenticatedAction((api) =>
      api.nizam.setPlatformPolicy({ key, setPlatformPolicyDto: { enabled } })
    )
  );

// ---- course requests (nizam 39) -----------------------------------------------------

/** One tab of a köşk's course requests. */
export const loadCourseRequests = async (
  koskId: string,
  status: RequestTab
): Promise<AuthenticatedActionResult<CourseRequestListResponse>> =>
  authenticatedAction((api) =>
    api.kosks.listCourseRequests({ id: koskId, status })
  );

/** The course was opened from the request: the request is accepted with it. */
export const acceptCourseRequest = async (
  id: string,
  courseId: string
): Promise<AuthenticatedActionResult<null>> =>
  refresh(
    await authenticatedAction(async (api) => {
      await api.kosks.acceptCourseRequest({
        id,
        acceptCourseRequestDto: { courseId },
      });
      return null;
    })
  );

/** "Reddet", with the reason the başmüderris will read. */
export const rejectCourseRequest = async (
  id: string,
  reason: string
): Promise<AuthenticatedActionResult<null>> =>
  refresh(
    await authenticatedAction(async (api) => {
      await api.kosks.rejectCourseRequest({ id, rejectReasonDto: { reason } });
      return null;
    })
  );
