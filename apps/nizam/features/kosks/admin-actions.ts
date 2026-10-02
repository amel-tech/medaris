"use server";

import type {
  CreateKoskDto,
  KoskDirectoryItemResponse,
  KoskNazimResponse,
  KoskResponse,
} from "@medaris/services/tedrisat";
import { revalidatePath } from "next/cache";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/** "Köşk aç" (nizam 10): the köşk and its nazımları, written together. */
export const openKosk = async (
  dto: CreateKoskDto
): Promise<AuthenticatedActionResult<KoskResponse>> => {
  const result = await authenticatedAction((api) =>
    api.kosks.createKosk({ createKoskDto: dto })
  );
  // The list, the archive's scopes and the nazımları's scope pickers show it.
  if (result.success) revalidatePath("/", "layout");
  return result;
};

/** "Köşkü gizle" (nizam 24): the köşk and its courses leave every list. */
export const hideKosk = async (
  id: string
): Promise<AuthenticatedActionResult<KoskDirectoryItemResponse>> => {
  const result = await authenticatedAction((api) => api.kosks.hideKosk({ id }));
  if (result.success) revalidatePath("/", "layout");
  return result;
};

/** "Köşkü pasife al" (nizam 20): the köşk is passive and its nazımları are off the post. */
export const deactivateKosk = async (
  id: string
): Promise<AuthenticatedActionResult<KoskDirectoryItemResponse>> => {
  const result = await authenticatedAction((api) =>
    api.kosks.deactivateKosk({ id })
  );
  if (result.success) revalidatePath("/", "layout");
  return result;
};

/** "Geri al" (nizam 09): a hidden köşk is listed again. */
export const restoreKosk = async (
  id: string
): Promise<AuthenticatedActionResult<KoskDirectoryItemResponse>> => {
  const result = await authenticatedAction((api) =>
    api.kosks.restoreKosk({ id })
  );
  if (result.success) revalidatePath("/", "layout");
  return result;
};

/** "Köşk nazımı ekle" (nizam 21): the chosen accounts become the köşk's nazımları. */
export const addKoskNazims = async (
  id: string,
  userIds: string[],
  endsAt?: string
): Promise<AuthenticatedActionResult<KoskNazimResponse[]>> => {
  const result = await authenticatedAction((api) =>
    api.kosks.addKoskNazims({
      id,
      addKoskNazimsDto: {
        userIds,
        ...(endsAt ? { endsAt: new Date(endsAt) } : {}),
      },
    })
  );
  if (result.success) revalidatePath("/", "layout");
  return result;
};
