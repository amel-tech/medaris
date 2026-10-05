"use server";

import type {
  CreateMadrasahPermissionGroupDto,
  DismissMadrasahNazirDecisionDto,
  MadrasahNazirGivenResponse,
  UsersPolicy,
} from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  type AuthenticatedActionResult,
  authenticatedAction,
  errorCodeOf,
  outcomeOf,
} from "~/lib/authenticated-action";
import { type PickedPerson, pickedPerson } from "./nazirs";
import {
  type Catalog,
  type GroupOutcome,
  type GroupPatch,
  type GroupView,
  type HeldPermissions,
  type PermissionsRequest,
  userCountOf,
} from "./permissions";

export type LookupOutcome =
  | { kind: "found"; person: PickedPerson }
  | { kind: "none" }
  | { kind: "unavailable" };

/**
 * The search of "Medrese nazırı ata" (`GET /users/lookup`): an exact e-mail
 * address against the realm's directory. The API writes every call to the audit
 * log, so the dialog searches on Enter, not on every key. Finding no one is an
 * answer; a directory that cannot be reached is "şu an yapılamıyor".
 */
export async function lookupPerson(email: string): Promise<LookupOutcome> {
  const result = await authenticatedAction((api) =>
    api.users.lookupUser({ email: email.trim() })
  );
  if (!result.success) {
    console.error("Error looking a user up:", result.error);
    return { kind: "unavailable" };
  }
  const [user] = result.data;
  return user
    ? { kind: "found", person: pickedPerson(user) }
    : { kind: "none" };
}

/** "Ata": the person becomes a nazır of the medrese with no permission (`POST /madrasahs/:id/nazirs/:userId`; again is a no-op). */
export async function appointNazir(
  madrasahId: string,
  userId: string
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.madrasahs.addMadrasahNazir({ id: madrasahId, userId });
    return null;
  });
  if (!result.success) console.error("Error appointing:", result.error);
  return outcomeOf(result);
}

/** What the nazır gave to whom in the medrese and its courses, which the dismissal asks about. */
export async function getNazirGrants(
  madrasahId: string,
  userId: string
): Promise<ActionOutcome<MadrasahNazirGivenResponse[]>> {
  const result = await authenticatedAction((api) =>
    api.madrasahs.getMadrasahNazirGrants({ id: madrasahId, userId })
  );
  if (!result.success)
    console.error("Error fetching what the nazır gave:", result.error);
  return outcomeOf(result);
}

/** "Görevden al": one decision for every person listed, all or nothing (`DELETE /madrasahs/:id/nazirs/:userId`). */
export async function dismissNazir(
  madrasahId: string,
  userId: string,
  decisions: DismissMadrasahNazirDecisionDto[]
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.madrasahs.removeMadrasahNazir({
      id: madrasahId,
      userId,
      dismissMadrasahNazirDto: { decisions },
    });
    return null;
  });
  if (!result.success) console.error("Error dismissing:", result.error);
  return outcomeOf(result);
}

// ---- permissions and groups (nazir 06, 16) ---------------------------------------

const viewOf = (group: GroupView): GroupView => ({
  id: group.id,
  name: group.name,
  scope: group.scope,
  permissions: group.permissions,
  userCount: group.userCount,
});

/** The dictionary of codes and which of them the caller may give (`GET /madrasahs/:id/permissions`). */
export async function loadCatalog(
  madrasahId: string
): Promise<ActionOutcome<Catalog>> {
  const result = await authenticatedAction(async (api) => {
    const { madrasah, course, givable } =
      await api.madrasahs.getMadrasahPermissions({ id: madrasahId });
    return { madrasah, course, givable };
  });
  if (!result.success)
    console.error("Error fetching the permission dictionary:", result.error);
  return outcomeOf(result);
}

/** Everything "İzinleri düzenle" opens with. */
export interface EditorData {
  catalog: Catalog;
  groups: GroupView[];
  held: HeldPermissions;
  courses: Array<{ id: string; title: string }>;
}

/**
 * What the permission editor needs, read together on every opening: the
 * dictionary, the medrese's groups, what the nazır holds now and the courses
 * "Hangi derslerde" can name. One read failing is the whole editor failing:
 * half a form would let a başmüderris save over what they could not see.
 */
export async function loadEditor(
  madrasahId: string,
  userId: string
): Promise<ActionOutcome<EditorData>> {
  const result = await authenticatedAction(async (api): Promise<EditorData> => {
    const [catalog, groups, held, courses] = await Promise.all([
      api.madrasahs.getMadrasahPermissions({ id: madrasahId }),
      api.madrasahs.getMadrasahPermissionGroups({ id: madrasahId }),
      api.madrasahs.getMadrasahNazirPermissions({ id: madrasahId, userId }),
      api.madrasahs.getMadrasahCourses({ id: madrasahId }),
    ]);
    return {
      catalog: {
        madrasah: catalog.madrasah,
        course: catalog.course,
        givable: catalog.givable,
      },
      groups: groups.map(viewOf),
      held: {
        groupId: held.groupId,
        permissions: held.permissions,
        courseIds: held.courseIds,
        expiresAt: held.expiresAt
          ? new Date(held.expiresAt).toISOString()
          : null,
      },
      courses: courses.map((course) => ({
        id: course.id,
        title: course.title,
      })),
    };
  });
  if (!result.success)
    console.error("Error fetching the nazır's permissions:", result.error);
  return outcomeOf(result);
}

/** "Kaydet" of nazir 06: the nazır's group, single permissions, courses and end are replaced (`PUT /madrasahs/:id/nazirs/:userId/permissions`). */
export async function saveNazirPermissions(
  madrasahId: string,
  userId: string,
  request: PermissionsRequest
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.madrasahs.setMadrasahNazirPermissions({
      id: madrasahId,
      userId,
      setMadrasahNazirPermissionsDto: {
        groupId: request.groupId,
        permissions: request.permissions,
        courseIds: request.courseIds,
        expiresAt: request.expiresAt ? new Date(request.expiresAt) : null,
      },
    });
    return null;
  });
  if (!result.success)
    console.error("Error saving the nazır's permissions:", result.error);
  return outcomeOf(result);
}

/**
 * A group write's answer. A refusal for want of an answer about the people who
 * hold the group (USERS_POLICY_REQUIRED) carries how many they are now, so the
 * question can be asked with the right number.
 */
const groupOutcome = (
  result: AuthenticatedActionResult<unknown>
): GroupOutcome =>
  result.success
    ? { success: true }
    : {
        success: false,
        code: errorCodeOf(result.errorBody),
        userCount: userCountOf(result.errorBody),
      };

/** "Grubu kaydet" of a new group (`POST /madrasahs/:id/permission-groups`). */
export async function createGroup(
  madrasahId: string,
  body: CreateMadrasahPermissionGroupDto
): Promise<GroupOutcome> {
  const result = await authenticatedAction((api) =>
    api.madrasahs.createMadrasahPermissionGroup({
      id: madrasahId,
      createMadrasahPermissionGroupDto: body,
    })
  );
  if (!result.success) console.error("Error defining a group:", result.error);
  return groupOutcome(result);
}

/** "Grubu kaydet" of an existing group: only what changed (`PATCH /madrasahs/:id/permission-groups/:groupId`). */
export async function updateGroup(
  madrasahId: string,
  groupId: string,
  patch: GroupPatch,
  usersPolicy?: UsersPolicy
): Promise<GroupOutcome> {
  const result = await authenticatedAction((api) =>
    api.madrasahs.updateMadrasahPermissionGroup({
      id: madrasahId,
      groupId,
      updateMadrasahPermissionGroupDto: { ...patch, usersPolicy },
    })
  );
  if (!result.success) console.error("Error changing a group:", result.error);
  return groupOutcome(result);
}

/** "Grubu sil"; the body is empty when nobody holds the group (`DELETE /madrasahs/:id/permission-groups/:groupId`). */
export async function removeGroup(
  madrasahId: string,
  groupId: string,
  usersPolicy?: UsersPolicy
): Promise<GroupOutcome> {
  const result = await authenticatedAction(async (api) => {
    await api.madrasahs.deleteMadrasahPermissionGroup({
      id: madrasahId,
      groupId,
      deletePermissionGroupDto: usersPolicy ? { usersPolicy } : {},
    });
    return null;
  });
  if (!result.success) console.error("Error deleting a group:", result.error);
  return groupOutcome(result);
}
