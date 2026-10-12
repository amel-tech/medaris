import type {
  MeResponse,
  MyAssignmentsResponse,
  MyEffectivePermissionsResponse,
  MyPublicProfileResponse,
} from "@medaris/services/tedrisat";
import { cache } from "react";
import { memberApi } from "~/lib/tedrisat-api";

/**
 * Server-side reads for the account page's "Görevlerin ve izinlerin" section
 * (MDRS-169). Not a `"use server"` module: only server components call these.
 * Without a session they send the visitor to sign in (A16); the client is
 * built outside each `try` so that redirect is not taken for a failed read.
 */
export interface AccountRoles {
  assignments: MyAssignmentsResponse["assignments"];
  groups: MyEffectivePermissionsResponse["groups"];
}

/** Both reads, or null when either fails, so the section can say so and the rest of the page stays. Cached per request: the page's subtitle and the section read it once. */
export const getAccountRoles = cache(async (): Promise<AccountRoles | null> => {
  const { me } = await memberApi();
  try {
    const [assignments, permissions] = await Promise.all([
      me.getMyAssignments(),
      me.getMyEffectivePermissions(),
    ]);
    return {
      assignments: assignments.assignments,
      groups: permissions.groups,
    };
  } catch (error) {
    console.error("Error fetching the caller's roles:", error);
    return null;
  }
});

/** The caller's name, e-mail and time zone for Hesap (MDRS-166); null when the read fails, so the cards can say so. */
export const getMyProfile = async (): Promise<MeResponse | null> => {
  const { me } = await memberApi();
  try {
    return await me.getMe();
  } catch (error) {
    console.error("Error fetching the caller's profile:", error);
    return null;
  }
};

/** The caller's public profile with every switch, for Herkese açık profil (MDRS-166); null when the read fails. */
export const getMyPublicProfile =
  async (): Promise<MyPublicProfileResponse | null> => {
    const { me } = await memberApi();
    try {
      return await me.getMyPublicProfile();
    } catch (error) {
      console.error("Error fetching the caller's public profile:", error);
      return null;
    }
  };
