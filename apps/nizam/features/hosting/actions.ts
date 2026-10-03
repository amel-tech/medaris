"use server";

import type {
  HostingCoursesAction,
  HostingRightResponse,
} from "@medaris/services/tedrisat";
import { revalidatePath } from "next/cache";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/** "Barındırma hakkı ver" (nizam 26): the medrese may open courses in this köşk. */
export const grantHostingRight = async (
  koskId: string,
  madrasahId: string
): Promise<AuthenticatedActionResult<HostingRightResponse>> => {
  const result = await authenticatedAction((api) =>
    api.kosks.grantKoskHostingRight({
      id: koskId,
      grantHostingRightDto: { madrasahId },
    })
  );
  if (result.success) revalidatePath("/", "layout");
  return result;
};

/**
 * "Barındırma hakkını geri al" (nizam 27): withdraws the right and decides what
 * becomes of the medrese's open courses here — they carry on (KEEP) or are
 * hidden and come back from the Arşiv (HIDE). Written to the audit log.
 */
export const revokeHostingRight = async (
  koskId: string,
  madrasahId: string,
  coursesAction: HostingCoursesAction
): Promise<AuthenticatedActionResult<null>> => {
  const result = await authenticatedAction(async (api) => {
    await api.kosks.revokeKoskHostingRight({
      id: koskId,
      madrasahId,
      coursesAction,
    });
    return null;
  });
  // Hidden courses leave the course lists and join the archive.
  if (result.success) revalidatePath("/", "layout");
  return result;
};
