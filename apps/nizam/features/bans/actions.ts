"use server";

import type {
  AllBansListResponse,
  BanListResponse,
  BanResponse,
} from "@medaris/services/tedrisat";
import { revalidatePath } from "next/cache";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/** "Yasakla" (nizam 41): bars a talebe from a course, or from its whole köşk. */
export const createBan = async (input: {
  courseId: string;
  userId: string;
  scope: "COURSE" | "KOSK";
  reason: string;
}): Promise<AuthenticatedActionResult<BanResponse>> => {
  const result = await authenticatedAction((api) =>
    api.bans.createBan({
      courseId: input.courseId,
      createBanDto: {
        userId: input.userId,
        scope: input.scope,
        reason: input.reason,
      },
    })
  );
  // The rosters and the ban list both show it.
  if (result.success) revalidatePath("/", "layout");
  return result;
};

/** "Yasağı kaldır" (nizam 42): lifts a ban with a reason. */
export const liftBan = async (
  banId: string,
  reason: string
): Promise<AuthenticatedActionResult<BanResponse>> => {
  const result = await authenticatedAction((api) =>
    api.bans.liftBan({ banId, liftBanDto: { reason } })
  );
  if (result.success) revalidatePath("/", "layout");
  return result;
};

/** One page of every köşk's bans for Medaris administration (nizam 48). */
export const loadAllBans = async (query: {
  status: "ACTIVE" | "LIFTED";
  scope?: "COURSE" | "KOSK";
  q?: string;
  offset?: number;
}): Promise<AuthenticatedActionResult<AllBansListResponse>> =>
  authenticatedAction((api) =>
    api.bans.listAllBans({
      status: query.status,
      scope: query.scope,
      q: query.q?.trim() || undefined,
      offset: query.offset,
      limit: 20,
    })
  );

/** "Yasağı genişlet" (nizam 48): moves a course ban up to the whole köşk. */
export const extendBan = async (
  banId: string,
  reason: string
): Promise<AuthenticatedActionResult<BanResponse>> => {
  const result = await authenticatedAction((api) =>
    api.bans.extendBan({
      banId,
      extendBanDto: { scope: "KOSK", reason },
    })
  );
  if (result.success) revalidatePath("/", "layout");
  return result;
};

/** A köşk's bans, active or lifted, for the tabs of nizam 42. */
export const loadKoskBans = async (
  koskId: string,
  status: "ACTIVE" | "LIFTED"
): Promise<AuthenticatedActionResult<BanListResponse>> =>
  authenticatedAction((api) => api.bans.listKoskBans({ koskId, status }));
