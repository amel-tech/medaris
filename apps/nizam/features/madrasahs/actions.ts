"use server";

import {
  type CreateMadrasahDto,
  createServerTedrisatAPIs,
  type MadrasahDirectoryItemResponse,
  type MadrasahResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { revalidatePath } from "next/cache";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";
import { type PickedUser, pickedUser } from "./present";

/** "Medrese aç" (nizam 08): the medrese and its başmüderris, written together. */
export const openMadrasah = async (
  dto: CreateMadrasahDto
): Promise<AuthenticatedActionResult<MadrasahResponse>> => {
  const result = await authenticatedAction((api) =>
    api.madrasahs.createMadrasah({ createMadrasahDto: dto })
  );
  // The list, the archive's scopes and the köşk pages' pickers all show it.
  if (result.success) revalidatePath("/", "layout");
  return result;
};

/** "Geri al" (nizam 07): a hidden medrese is listed again. */
export const restoreMadrasah = async (
  id: string
): Promise<AuthenticatedActionResult<MadrasahDirectoryItemResponse>> => {
  const result = await authenticatedAction((api) =>
    api.madrasahs.restoreMadrasah({ id })
  );
  if (result.success) revalidatePath("/", "layout");
  return result;
};

/** "Başmüderris ata" (nizam 07, 22): the chosen account heads the medrese; a passive one is active again. */
export const setHeadMuderris = async (
  id: string,
  userId: string
): Promise<AuthenticatedActionResult<MadrasahDirectoryItemResponse>> => {
  const result = await authenticatedAction((api) =>
    api.madrasahs.setMadrasahHeadMuderris({
      id,
      setHeadMuderrisDto: { userId },
    })
  );
  if (result.success) revalidatePath("/", "layout");
  return result;
};

export type LookupResult =
  | { kind: "found"; user: PickedUser }
  | { kind: "none" }
  | { kind: "unavailable" };

/**
 * The başmüderris picker's search (nizam 08): an exact e-mail address against
 * the realm's directory. Every call is written to the audit log by the API,
 * so the caller searches on Enter, not on every key. Not finding anyone is an
 * answer, not a failure; a directory that cannot be reached is the picker's
 * "şu an yapılamıyor".
 */
export const lookupUserByEmail = async (
  email: string
): Promise<LookupResult> => {
  const accessToken = await getAccessToken();
  if (!accessToken) return { kind: "unavailable" };
  try {
    const { users } = await createServerTedrisatAPIs(
      accessToken,
      env.TEDRISAT_API_BASE_URL
    );
    const found = await users.lookupUser({ email: email.trim() });
    const [first] = found;
    return first
      ? { kind: "found", user: pickedUser(first) }
      : { kind: "none" };
  } catch (error) {
    if (!(error instanceof ResponseError)) {
      console.error("Error looking a user up:", error);
    }
    return { kind: "unavailable" };
  }
};
