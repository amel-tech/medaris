"use server";

import {
  isUnauthenticated,
  type Unauthenticated,
  unauthenticated,
} from "@medaris/auth/server";
import { isValidTimeZone } from "@medaris/utils";
import { authenticatedAction } from "~/lib/authenticated-action";

/**
 * Saves the time zone the caller's dates are shown in (`PATCH /me`). The
 * answer is only whether it worked: the page words a failure itself, and the
 * server's message (which can name internals) never reaches the browser. A
 * session that is over is no failure to word: the page sends it to sign-in.
 */
export async function updateTimeZone(
  timeZone: string
): Promise<{ success: boolean } | Unauthenticated> {
  if (!isValidTimeZone(timeZone)) return { success: false };
  const result = await authenticatedAction((api) =>
    api.me.updateMe({ updateMeDto: { timeZone } })
  );
  if (!result.success)
    console.error("Error saving the time zone:", result.error);
  if (isUnauthenticated(result)) return unauthenticated();
  return { success: result.success };
}
