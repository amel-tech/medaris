"use server";

import type { PermanentBanRequestListResponse } from "@medaris/services/tedrisat";
import { revalidatePath } from "next/cache";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
  succeeded,
} from "~/lib/authenticated-action";
import type { RequestTab } from "../platform-admin/present";

const refresh = <T>(result: AuthenticatedActionResult<T>) => {
  if (succeeded(result)) revalidatePath("/", "layout");
  return result;
};

/** One tab of Kalıcı yasak talepleri. */
export const loadPermanentBans = async (
  status: RequestTab
): Promise<AuthenticatedActionResult<PermanentBanRequestListResponse>> =>
  authenticatedAction((api) => api.nizam.listPermanentBanRequests({ status }));

/** "Onayla": the person is barred from all of Medaris. */
export const approvePermanentBan = async (
  id: string
): Promise<AuthenticatedActionResult<null>> =>
  refresh(
    await authenticatedAction(async (api) => {
      await api.nizam.approvePermanentBanRequest({ id });
      return null;
    })
  );

/** "Reddet", with the note whoever asked will read; the lower ban stays. */
export const rejectPermanentBan = async (
  id: string,
  note: string
): Promise<AuthenticatedActionResult<null>> =>
  refresh(
    await authenticatedAction(async (api) => {
      await api.nizam.rejectPermanentBanRequest({
        id,
        rejectPermanentBanRequestDto: { note },
      });
      return null;
    })
  );
