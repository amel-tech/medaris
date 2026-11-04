"use server";

import type { AppealListResponse } from "@medaris/services/tedrisat";
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

/** One tab of İtirazlar. */
export const loadAppeals = async (
  status: RequestTab
): Promise<AuthenticatedActionResult<AppealListResponse>> =>
  authenticatedAction((api) => api.nizam.listAppeals({ status }));

/** "Kabul et": the course request goes back to the köşk as waiting. */
export const acceptAppeal = async (
  id: string
): Promise<AuthenticatedActionResult<null>> =>
  refresh(
    await authenticatedAction(async (api) => {
      await api.nizam.acceptAppeal({ id });
      return null;
    })
  );

/** "Reddet", with the decision note the medrese will read. */
export const rejectAppeal = async (
  id: string,
  note: string
): Promise<AuthenticatedActionResult<null>> =>
  refresh(
    await authenticatedAction(async (api) => {
      await api.nizam.rejectAppeal({ id, rejectAppealDto: { note } });
      return null;
    })
  );
