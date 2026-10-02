import {
  type AssignmentResponse,
  createServerTedrisatAPIs,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

/**
 * Server-side reads behind the "Bu işler Nazır'da" and "erişim yok" screens
 * (MDRS-169). Not a `"use server"` module: only server components call them.
 */
const api = async () =>
  createServerTedrisatAPIs(await getAccessToken(), env.TEDRISAT_API_BASE_URL);

export interface MyAssignments {
  systemAdmin: boolean;
  assignments: AssignmentResponse[];
}

/** The caller's held roles and whether they are SYSTEM_ADMIN; null when either read fails. */
export const getMyAssignments = async (): Promise<MyAssignments | null> => {
  try {
    const { me } = await api();
    const [assignments, roles] = await Promise.all([
      me.getMyAssignments(),
      me.getMyRoles(),
    ]);
    return {
      systemAdmin: roles.systemAdmin,
      assignments: assignments.assignments,
    };
  } catch (error) {
    console.error("Error fetching the caller's roles:", error);
    return null;
  }
};

/** The Medaris başnazımı's name, or null: the "no access" sentence has a version without one. */
export const getChiefNazimName = async (): Promise<string | null> => {
  try {
    const { nizam } = await api();
    return (await nizam.getChiefNazim()).displayName ?? null;
  } catch {
    return null;
  }
};
