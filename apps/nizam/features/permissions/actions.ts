"use server";

import type {
  AppointMedarisNazimDto,
  CreatePermissionGroupDto,
  DismissDecisionDto,
  GivenItemResponse,
  MedarisNazimResponse,
  PermissionGroupResponse,
  SetNazimGrantsDto,
  UpdatePermissionGroupDto,
  UsersPolicy,
} from "@medaris/services/tedrisat";
import { revalidatePath } from "next/cache";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/** What the Medaris nazımları and İzin grupları pages show changes with every write here. */
const refresh = (result: { success: boolean }) => {
  if (result.success) revalidatePath("/", "layout");
};

/** "Medaris nazımı ata" (nizam 11, 12): the appointment and its permissions, together. */
export const appointNazim = async (
  dto: AppointMedarisNazimDto
): Promise<AuthenticatedActionResult<MedarisNazimResponse>> => {
  const result = await authenticatedAction(({ nizam }) =>
    nizam.appointMedarisNazim({ appointMedarisNazimDto: dto })
  );
  refresh(result);
  return result;
};

/** "Kaydet" of the izin dialog (nizam 12): the group, the single permissions and the end. */
export const setNazimGrants = async (
  userId: string,
  dto: SetNazimGrantsDto
): Promise<AuthenticatedActionResult<MedarisNazimResponse>> => {
  const result = await authenticatedAction(({ nizam }) =>
    nizam.setMedarisNazimGrants({ userId, setNazimGrantsDto: dto })
  );
  refresh(result);
  return result;
};

/** What the person handed on, which the dismissal asks about (nizam 11). */
export const getGivenItems = async (
  userId: string
): Promise<AuthenticatedActionResult<GivenItemResponse[]>> =>
  authenticatedAction(({ nizam }) => nizam.getMedarisNazimGiven({ userId }));

/** "Görevden al" (nizam 11): one answer for every item the person handed on. */
export const dismissNazim = async (
  userId: string,
  decisions: DismissDecisionDto[]
): Promise<AuthenticatedActionResult<void>> => {
  const result = await authenticatedAction(({ nizam }) =>
    nizam.dismissMedarisNazim({
      userId,
      dismissMedarisNazimDto: { decisions },
    })
  );
  refresh(result);
  return result;
};

export const createGroup = async (
  dto: CreatePermissionGroupDto
): Promise<AuthenticatedActionResult<PermissionGroupResponse>> => {
  const result = await authenticatedAction(({ nizam }) =>
    nizam.createPermissionGroup({ createPermissionGroupDto: dto })
  );
  refresh(result);
  return result;
};

export const updateGroup = async (
  id: string,
  dto: UpdatePermissionGroupDto
): Promise<AuthenticatedActionResult<PermissionGroupResponse>> => {
  const result = await authenticatedAction(({ nizam }) =>
    nizam.updatePermissionGroup({ id, updatePermissionGroupDto: dto })
  );
  refresh(result);
  return result;
};

export const deleteGroup = async (
  id: string,
  usersPolicy?: UsersPolicy
): Promise<AuthenticatedActionResult<void>> => {
  const result = await authenticatedAction(({ nizam }) =>
    nizam.deletePermissionGroup({
      id,
      deletePermissionGroupDto: { usersPolicy },
    })
  );
  refresh(result);
  return result;
};
