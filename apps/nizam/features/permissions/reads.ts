import {
  createServerTedrisatAPIs,
  type GroupUserResponse,
  type MedarisNazimResponse,
  type PermissionCatalogResponse,
  type PermissionGroupResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

/**
 * Server-side first reads of Medaris nazımları and İzin grupları (MDRS-171).
 * Not a `"use server"` module: only the pages call them. A failed read is
 * `null` so the page can show its error state instead of a crash; a 403 is
 * told apart so the page shows "Bu bölüm için izniniz yok" (nizam/06) — these
 * are the Medaris başnazımı's pages alone.
 */
export type Read<T> = T | "forbidden" | null;

type Api = Awaited<ReturnType<typeof createServerTedrisatAPIs>>;

async function read<T>(
  what: string,
  call: (api: Api) => Promise<T>
): Promise<Read<T>> {
  try {
    return await call(
      await createServerTedrisatAPIs(
        await getAccessToken(),
        env.TEDRISAT_API_BASE_URL
      )
    );
  } catch (error) {
    if (error instanceof ResponseError && error.response.status === 403) {
      return "forbidden";
    }
    console.error(`Error fetching ${what}:`, error);
    return null;
  }
}

export const getNazims = (): Promise<Read<MedarisNazimResponse[]>> =>
  read("the Medaris nazımları", ({ nizam }) => nizam.getMedarisNazims());

export const getCatalog = (): Promise<Read<PermissionCatalogResponse>> =>
  read("the permission catalog", ({ nizam }) => nizam.getPermissionCatalog());

export const getGroups = (): Promise<Read<PermissionGroupResponse[]>> =>
  read("the permission groups", ({ nizam }) => nizam.getPermissionGroups());

export const getGroupUsers = (id: string): Promise<Read<GroupUserResponse[]>> =>
  read("a permission group's users", ({ nizam }) =>
    nizam.getPermissionGroupUsers({ id })
  );
