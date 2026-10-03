import {
  createServerTedrisatAPIs,
  type MyAssignmentsResponse,
  type MyEffectivePermissionsResponse,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

/**
 * Server-side reads for the account page's "Görevlerin ve izinlerin" section
 * (MDRS-169). Not a `"use server"` module: only server components call these.
 */
export interface AccountRoles {
  assignments: MyAssignmentsResponse["assignments"];
  groups: MyEffectivePermissionsResponse["groups"];
}

/** Both reads, or null when either fails, so the section can say so and the rest of the page stays. */
export const getAccountRoles = async (): Promise<AccountRoles | null> => {
  try {
    const { me } = await createServerTedrisatAPIs(
      await getAccessToken(),
      env.TEDRISAT_API_BASE_URL
    );
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
};
