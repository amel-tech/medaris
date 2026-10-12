import type { AssignmentResponse } from "@medaris/services/tedrisat";
import { type OnRefused, passOnSignIn, tedrisatApi } from "~/lib/tedrisat-api";

/**
 * Server-side reads behind the "Bu işler Nazar'da" and "erişim yok" screens
 * (MDRS-169). Not a `"use server"` module: only server components call them.
 */
export interface MyAssignments {
  systemAdmin: boolean;
  assignments: AssignmentResponse[];
}

/**
 * The caller's held roles and whether they are SYSTEM_ADMIN; null when either
 * read fails. The shell passes `"fail"` (see `OnRefused`): it also wraps the
 * sign-in page, where sending a refused token to sign-in would only come back.
 */
export const getMyAssignments = async (
  onRefused: OnRefused = "sign-in"
): Promise<MyAssignments | null> => {
  try {
    const { me } = await tedrisatApi();
    const [assignments, roles] = await Promise.all([
      me.getMyAssignments(),
      me.getMyRoles(),
    ]);
    return {
      systemAdmin: roles.systemAdmin,
      assignments: assignments.assignments,
    };
  } catch (error) {
    await passOnSignIn(error, onRefused);
    console.error("Error fetching the caller's roles:", error);
    return null;
  }
};

/** The Medaris başnazımı's name, or null: the "no access" sentence has a version without one. */
export const getChiefNazimName = async (): Promise<string | null> => {
  try {
    const { nizam } = await tedrisatApi();
    return (await nizam.getChiefNazim()).displayName ?? null;
  } catch (error) {
    await passOnSignIn(error);
    return null;
  }
};

/** The permission codes the caller holds in any scope; null when they cannot be read (nothing is then hidden). `onRefused` as in `getMyAssignments`. */
export const getMyPermissionCodes = async (
  onRefused: OnRefused = "sign-in"
): Promise<ReadonlySet<string> | null> => {
  try {
    const { me } = await tedrisatApi();
    return new Set((await me.getMyPermissions()).permissions);
  } catch (error) {
    await passOnSignIn(error, onRefused);
    console.error("Error fetching the caller's permissions:", error);
    return null;
  }
};
