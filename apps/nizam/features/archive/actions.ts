"use server";

import type {
  ArchiveImpactResponse,
  ArchiveItemType,
  ArchiveRestoreResponse,
  PaginatedArchiveResponse,
} from "@medaris/services/tedrisat";
import { revalidatePath } from "next/cache";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

export interface ArchiveQuery {
  /** Set: that köşk's archive. Unset: the platform's. */
  koskScope?: string;
  koskId?: string;
  madrasahId?: string;
  type?: ArchiveItemType;
  q?: string;
  page: number;
  limit: number;
}

/** One page of the archive, for the köşk (nizam 28) or the platform (nizam 29). */
export const loadArchive = async (
  query: ArchiveQuery
): Promise<AuthenticatedActionResult<PaginatedArchiveResponse>> =>
  authenticatedAction((api) =>
    query.koskScope
      ? api.archive.listKoskArchive({
          id: query.koskScope,
          type: query.type,
          q: query.q || undefined,
          page: query.page,
          limit: query.limit,
        })
      : api.archive.listArchive({
          koskId: query.koskId,
          madrasahId: query.madrasahId,
          type: query.type,
          q: query.q || undefined,
          page: query.page,
          limit: query.limit,
        })
  );

/** "Geri al". */
export const restoreArchiveItem = async (
  type: ArchiveItemType,
  id: string
): Promise<AuthenticatedActionResult<ArchiveRestoreResponse>> => {
  const result = await authenticatedAction((api) =>
    api.archive.restoreArchiveItem({ type, id })
  );
  // What came back is listed in the places it came back to.
  if (result.success) revalidatePath("/", "layout");
  return result;
};

/** What "Kalıcı olarak sil" would take, for the confirmation. */
export const loadArchiveImpact = async (
  type: ArchiveItemType,
  id: string
): Promise<AuthenticatedActionResult<ArchiveImpactResponse>> =>
  authenticatedAction((api) => api.archive.getArchiveImpact({ type, id }));

/** "Kalıcı olarak sil": irreversible, written to the audit log under the caller's name. */
export const deleteArchiveItem = async (
  type: ArchiveItemType,
  id: string
): Promise<AuthenticatedActionResult<null>> => {
  const result = await authenticatedAction(async (api) => {
    await api.archive.deleteArchiveItem({ type, id });
    return null;
  });
  if (result.success) revalidatePath("/", "layout");
  return result;
};
