import {
  createServerTedrisatAPIs,
  type KoskResponse,
  type MadrasahExploreResponse,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";
import { type DiscoverQuery, PAGE_SIZE } from "./discover-query";

/**
 * Keşfet's reads (MDRS-159). Unlike the köşk reads they replaced, a failure is
 * not an empty list: it throws, and the page says so in an Alert, so an API
 * that is down never looks like a platform with no köşks.
 */
export interface DiscoverData {
  kosks: KoskResponse[];
  koskTotal: number;
  madrasahs: MadrasahExploreResponse[];
  /** Every medrese, for the select, whatever the filters say. */
  allMadrasahs: MadrasahExploreResponse[];
  fields: string[];
}

/**
 * What a visitor with no account sees of the list (design tedris/09): the
 * medreses that have opened a course. A signed-in talebe also sees the ones
 * that have not (design tedris/02), but there is nothing to browse in an empty
 * medrese and no account to wait for one with.
 */
export const forVisitor = (data: DiscoverData): DiscoverData => ({
  ...data,
  madrasahs: data.madrasahs.filter((m) => m.courseCount > 0),
  allMadrasahs: data.allMadrasahs.filter((m) => m.courseCount > 0),
});

export const getDiscoverData = async (
  query: DiscoverQuery
): Promise<DiscoverData> => {
  const accessToken = await getAccessToken();
  const { kosks, madrasahs } = await createServerTedrisatAPIs(
    accessToken,
    env.TEDRISAT_API_BASE_URL
  );
  const filters = {
    level: query.level ?? undefined,
    field: query.field ?? undefined,
    q: query.q || undefined,
  };
  const [page, fields, filtered, all] = await Promise.all([
    kosks.getAllKosks({
      page: query.page,
      limit: PAGE_SIZE,
      madrasahId: query.madrasahId ?? undefined,
      ...filters,
    }),
    kosks.getKoskFields(),
    madrasahs.exploreMadrasahs({
      madrasahId: query.madrasahId ?? undefined,
      ...filters,
    }),
    madrasahs.exploreMadrasahs({}),
  ]);
  const data = {
    kosks: page.items,
    koskTotal: page.total,
    madrasahs: filtered,
    allMadrasahs: all,
    fields,
  };
  return accessToken ? data : forVisitor(data);
};
