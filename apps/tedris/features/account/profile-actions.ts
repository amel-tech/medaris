"use server";

import type { MeResponse } from "@medaris/services/tedrisat";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";
import { syncViewerTimeZone } from "~/lib/viewer-time-zone";

/** "Kaydet" on Hesap's personal-information card (MDRS-166). */
export const updateMyName = async (
  givenName: string,
  familyName: string
): Promise<AuthenticatedActionResult<MeResponse>> =>
  authenticatedAction((api) =>
    api.me.updateMe({ updateMeDto: { givenName, familyName } })
  );

/**
 * The time-zone select (MDRS-166): saved the moment it changes. The viewer's
 * zone cookie follows, so Programım and every other date on the page switch
 * zone without a reload (`syncViewerTimeZone` re-renders the route).
 */
export const updateMyTimeZone = async (
  timeZone: string
): Promise<AuthenticatedActionResult<MeResponse>> => {
  const saved = await authenticatedAction((api) =>
    api.me.updateMe({ updateMeDto: { timeZone } })
  );
  if (saved.success) {
    await syncViewerTimeZone(timeZone).catch(() => undefined);
  }
  return saved;
};
