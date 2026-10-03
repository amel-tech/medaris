import { createServerTedrisatAPIs } from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

/** The tedrisat client for the signed-in caller; server components and layouts only. */
export const tedrisatApi = async () =>
  createServerTedrisatAPIs(await getAccessToken(), env.TEDRISAT_API_BASE_URL);
