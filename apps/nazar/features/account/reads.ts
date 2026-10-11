import type {
  EffectivePermissionGroup,
  MeResponse,
} from "@medaris/services/tedrisat";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { tedrisatApi } from "~/lib/tedrisat-api";

/**
 * Server-side reads for the account page (MDRS-183). Not a `"use server"`
 * module: only server components call them. A read that fails is `null`, so
 * that one section can say so and the rest of the page stays.
 */

/** `GET /me`: the zone the dates are shown in, once per request. */
export const getViewer = cache(async (): Promise<MeResponse | null> => {
  try {
    return await (await tedrisatApi()).me.getMe();
  } catch (error) {
    // `tedrisatApi`'s way to sign-in when the session is over.
    unstable_rethrow(error);
    console.error("Error fetching the caller's profile:", error);
    return null;
  }
});

/** The caller's permissions by role and scope; null when the read fails. */
export const getEffectivePermissions = async (): Promise<
  EffectivePermissionGroup[] | null
> => {
  try {
    const { groups } = await (
      await tedrisatApi()
    ).me.getMyEffectivePermissions();
    return groups;
  } catch (error) {
    unstable_rethrow(error);
    console.error("Error fetching the caller's permissions:", error);
    return null;
  }
};
