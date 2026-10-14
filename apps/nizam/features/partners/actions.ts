"use server";

import type { PartnerAdminResponse } from "@medaris/services/tedrisat";
import { revalidatePath } from "next/cache";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
  succeeded,
} from "~/lib/authenticated-action";

const refresh = <T>(result: AuthenticatedActionResult<T>) => {
  if (succeeded(result)) revalidatePath("/", "layout");
  return result;
};

/** "Ekle": registers a partner application, enabled and bound to no köşk. */
export const createPartner = async (
  clientId: string,
  name: string
): Promise<AuthenticatedActionResult<PartnerAdminResponse>> =>
  refresh(
    await authenticatedAction((api) =>
      api.nizam.createPartnerApplication({
        createPartnerDto: { clientId, name },
      })
    )
  );

/** "Adını değiştir" and the "Etkin" switch. */
export const updatePartner = async (
  clientId: string,
  change: { name?: string; enabled?: boolean }
): Promise<AuthenticatedActionResult<PartnerAdminResponse>> =>
  refresh(
    await authenticatedAction((api) =>
      api.nizam.updatePartnerApplication({
        clientId,
        updatePartnerDto: change,
      })
    )
  );

/** "Köşkleri seç": the partner's köşks are exactly these from now on. */
export const setPartnerKosks = async (
  clientId: string,
  koskIds: string[]
): Promise<AuthenticatedActionResult<PartnerAdminResponse>> =>
  refresh(
    await authenticatedAction((api) =>
      api.nizam.setPartnerApplicationKosks({
        clientId,
        setPartnerKosksDto: { koskIds },
      })
    )
  );
