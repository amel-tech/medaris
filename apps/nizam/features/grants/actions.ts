"use server";

import type {
  CreateKoskGrantDto,
  KoskGrantsResponse,
  UpdateKoskGrantDto,
} from "@medaris/services/tedrisat";
import { revalidatePath } from "next/cache";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/** "Ders nazırı ata" (nizam 38): the post and its permissions, together. */
export const createGrant = async (
  koskId: string,
  dto: CreateKoskGrantDto
): Promise<AuthenticatedActionResult<KoskGrantsResponse>> => {
  const result = await authenticatedAction((api) =>
    api.kosks.createKoskGrant({ id: koskId, createKoskGrantDto: dto })
  );
  if (result.success) revalidatePath("/", "layout");
  return result;
};

/** "İzinleri düzenle" (nizam 38): the whole set and the end, replaced. */
export const updateGrant = async (
  koskId: string,
  grantId: string,
  dto: UpdateKoskGrantDto
): Promise<AuthenticatedActionResult<KoskGrantsResponse>> => {
  const result = await authenticatedAction((api) =>
    api.kosks.updateKoskGrant({
      id: koskId,
      grantId,
      updateKoskGrantDto: dto,
    })
  );
  if (result.success) revalidatePath("/", "layout");
  return result;
};

/** "Görevden al" (nizam 38): the post and every permission end together. */
export const revokeGrant = async (
  koskId: string,
  grantId: string
): Promise<AuthenticatedActionResult<void>> => {
  const result = await authenticatedAction((api) =>
    api.kosks.revokeKoskGrant({ id: koskId, grantId })
  );
  if (result.success) revalidatePath("/", "layout");
  return result;
};
