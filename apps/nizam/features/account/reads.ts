import type {
  AssignmentResponse,
  EffectivePermissionGroup,
  MeResponse,
} from "@medaris/services/tedrisat";
import { passOnSignIn, tedrisatApi } from "~/lib/tedrisat-api";

/**
 * Server-side reads for "Hesap ve ayarlar" (nizam 36, 47, MDRS-179). Not a
 * `"use server"` module: only the server component calls them.
 */
export interface AccountData {
  me: MeResponse;
  systemAdmin: boolean;
  assignments: AssignmentResponse[];
  groups: EffectivePermissionGroup[];
}

/** Everything the page shows, or null when any read fails, so the page can say so and offer a retry. */
export const getAccountData = async (): Promise<AccountData | null> => {
  try {
    const { me } = await tedrisatApi();
    const [profile, assignments, permissions] = await Promise.all([
      me.getMe(),
      me.getMyAssignments(),
      me.getMyEffectivePermissions(),
    ]);
    return {
      me: profile,
      systemAdmin: profile.roles.systemAdmin,
      assignments: assignments.assignments,
      groups: permissions.groups,
    };
  } catch (error) {
    await passOnSignIn(error);
    console.error("Error fetching the account:", error);
    return null;
  }
};
