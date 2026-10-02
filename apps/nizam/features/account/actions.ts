"use server";

import type { MeResponse } from "@medaris/services/tedrisat";
import { isValidTimeZone } from "@medaris/utils";
import { revalidatePath } from "next/cache";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";
import { syncViewerTimeZone } from "~/lib/viewer-time-zone";

/**
 * Saves the zone the person's celse times are shown in (`PATCH /me`, which
 * the design's "PUT /me/preferences" is: tedrisat already owns the profile's
 * time zone since MDRS-104). The cookie that carries the zone to the server
 * render is brought in line right after, so the page and its dates switch at
 * once instead of at the next visit.
 */
export const saveTimeZone = async (
  timeZone: string
): Promise<AuthenticatedActionResult<MeResponse>> => {
  if (!isValidTimeZone(timeZone)) {
    return { success: false, error: "Unknown time zone" };
  }
  const result = await authenticatedAction((api) =>
    api.me.updateMe({ updateMeDto: { timeZone } })
  );
  if (result.success) {
    await syncViewerTimeZone(timeZone);
    revalidatePath("/", "layout");
  }
  return result;
};
