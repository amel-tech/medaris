"use server";

import type { InactiveScopeType } from "@medaris/services/tedrisat";
import { revalidatePath } from "next/cache";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/** "Başmüderris ata", "Köşk nazımı ata", "Müderris ata" (nizam 14): the scope is attended again. */
export const assignScope = async (
  type: InactiveScopeType,
  id: string,
  userId: string,
  endsAt?: Date
): Promise<AuthenticatedActionResult<void>> => {
  const result = await authenticatedAction((api) =>
    api.nizam.assignInactiveScope({
      type,
      id,
      assignInactiveScopeDto: { userId, ...(endsAt ? { endsAt } : {}) },
    })
  );
  // The list, the medrese and köşk tables and the menus' badges all show it.
  if (result.success) revalidatePath("/", "layout");
  return result;
};

/** "İçeriği gör" (nizam 14): every opening is written to the audit log by the API. */
export const recordScopeView = async (
  type: InactiveScopeType,
  id: string
): Promise<AuthenticatedActionResult<void>> =>
  authenticatedAction((api) => api.nizam.viewInactiveScope({ type, id }));
