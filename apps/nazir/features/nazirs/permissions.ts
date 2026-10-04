import type {
  CreateMadrasahPermissionGroupDto,
  MadrasahPermissionGroupResponse,
} from "@medaris/services/tedrisat";
import { isoToZonedLocal, resolveEnd } from "@medaris/utils";
import type { Messages } from "~/lib/i18n/messages";
import { permissionLabel } from "./nazirs";

/**
 * Giving permissions as rules (nazir 06 and 16): what the two dialogs tick,
 * lock and send, so that the dialogs have nothing to decide. Pure on purpose;
 * the API repeats every rule here and answers with a code when a rule is
 * broken anyway.
 */

/** The dictionary as the dialogs hold it: codes in print order, and the ones the caller may give. */
export interface Catalog {
  madrasah: readonly string[];
  course: readonly string[];
  givable: readonly string[];
}

const catalogCodes = (catalog: Catalog): string[] => [
  ...catalog.madrasah,
  ...catalog.course,
];

const isMadrasahCode = (catalog: Catalog, code: string): boolean =>
  catalog.madrasah.includes(code);

const hasMadrasahCode = (catalog: Catalog, codes: readonly string[]) =>
  codes.some((code) => isMadrasahCode(catalog, code));

/** Codes in the dictionary's order, each once, and nothing the dictionary does not know. */
const inCatalogOrder = (
  catalog: Catalog,
  codes: Iterable<string>
): string[] => {
  const wanted = new Set(codes);
  return catalogCodes(catalog).filter((code) => wanted.has(code));
};

const sameCodes = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((code) => b.includes(code));

// ---- one nazır (nazir 06) -----------------------------------------------------

/** A group as the editor's select and the cards read it. */
export type GroupView = Pick<
  MadrasahPermissionGroupResponse,
  "id" | "name" | "scope" | "permissions" | "userCount"
>;

/** What `GET /madrasahs/:id/nazirs/:userId/permissions` says, with the end as text. */
export interface HeldPermissions {
  groupId: string | null;
  permissions: readonly string[];
  /** null: every course of the medrese */
  courseIds: readonly string[] | null;
  expiresAt: string | null;
}

export interface EditorDraft {
  groupId: string | null;
  /** single permissions ticked on top of the group */
  extras: readonly string[];
  /** "Bütün medrese dersleri" (and the ones opened later) */
  everyCourse: boolean;
  courseIds: readonly string[];
  /** `YYYY-MM-DDTHH:mm` on the viewer's clock; "" for no end */
  expiresAtLocal: string;
}

export const heldGroup = (
  draft: Pick<EditorDraft, "groupId">,
  groups: readonly GroupView[]
): GroupView | null =>
  groups.find((group) => group.id === draft.groupId) ?? null;

/** The dialog as it opens: what the API holds, with a group that no longer exists read as none. */
export function initialDraft(
  held: HeldPermissions,
  groups: readonly GroupView[],
  timeZone: string
): EditorDraft {
  const group = groups.find((candidate) => candidate.id === held.groupId);
  return {
    groupId: group?.id ?? null,
    extras: held.permissions.filter(
      (code) => !group?.permissions.includes(code)
    ),
    everyCourse: held.courseIds === null,
    courseIds: held.courseIds ?? [],
    expiresAtLocal: isoToZonedLocal(held.expiresAt, timeZone),
  };
}

/** A group's permissions come ticked and locked: a single permission cannot be taken off the group. */
export const isLocked = (code: string, group: GroupView | null): boolean =>
  group?.permissions.includes(code) ?? false;

export const isTicked = (
  code: string,
  draft: EditorDraft,
  group: GroupView | null
): boolean => isLocked(code, group) || draft.extras.includes(code);

export function tick(
  draft: EditorDraft,
  code: string,
  on: boolean
): EditorDraft {
  const rest = draft.extras.filter((held) => held !== code);
  return { ...draft, extras: on ? [...rest, code] : rest };
}

/** A group that carries a medrese permission holds in the whole medrese, so it cannot be limited to courses. */
export function pickGroup(
  draft: EditorDraft,
  group: GroupView | null,
  catalog: Catalog
): EditorDraft {
  const spans = Boolean(group && hasMadrasahCode(catalog, group.permissions));
  return {
    ...draft,
    groupId: group?.id ?? null,
    everyCourse: spans ? true : draft.everyCourse,
  };
}

/** What the footer counts: the group's permissions, and the single ones beyond them. */
export function permissionCounts(
  draft: EditorDraft,
  group: GroupView | null,
  catalog: Catalog
): { group: number; extra: number } {
  const known = new Set(catalogCodes(catalog));
  const own = (group?.permissions ?? []).filter((code) => known.has(code));
  return {
    group: own.length,
    extra: draft.extras.filter((code) => known.has(code) && !own.includes(code))
      .length,
  };
}

export type NotLimitable = "group-spans-medrese" | "no-course-permission";

/**
 * Why "Hangi derslerde" cannot name courses, or null when it can: a group
 * with a medrese permission covers every course, and with no course
 * permission given there is nothing to limit.
 */
export function notLimitable(
  draft: EditorDraft,
  group: GroupView | null,
  catalog: Catalog
): NotLimitable | null {
  if (group && hasMadrasahCode(catalog, group.permissions)) {
    return "group-spans-medrese";
  }
  const given = [...draft.extras, ...(group?.permissions ?? [])];
  return given.some((code) => catalog.course.includes(code))
    ? null
    : "no-course-permission";
}

/** The courses the permissions are limited to; null for every course. */
export function limitedCourses(
  draft: EditorDraft,
  group: GroupView | null,
  catalog: Catalog
): string[] | null {
  return draft.everyCourse || notLimitable(draft, group, catalog)
    ? null
    : [...draft.courseIds];
}

export function toggleCourse(
  draft: EditorDraft,
  courseId: string,
  on: boolean
): EditorDraft {
  const rest = draft.courseIds.filter((id) => id !== courseId);
  return { ...draft, courseIds: on ? [...rest, courseId] : rest };
}

export type ExpiryProblem = "past" | "afterAppointment";

/**
 * The instant a chosen end stands for, or why it cannot be: after now and not
 * after the appointment's end, the server's own rule, compared as instants. An
 * end left as it was keeps the instant the API holds, seconds and all.
 */
export function expiryOf(
  draft: Pick<EditorDraft, "expiresAtLocal">,
  held: Pick<HeldPermissions, "expiresAt">,
  ctx: {
    now: number;
    timeZone: string;
    /** when the appointment ends, if it does */
    assignmentEnd: string | null;
  }
): { at: string | null; problem: ExpiryProblem | null } {
  const { iso, problem } = resolveEnd({
    value: draft.expiresAtLocal,
    held: held.expiresAt,
    timeZone: ctx.timeZone,
    now: new Date(ctx.now),
    assignmentEnd: ctx.assignmentEnd,
  });
  if (problem) {
    return {
      at: null,
      problem: problem === "past" ? "past" : "afterAppointment",
    };
  }
  return { at: iso, problem: null };
}

export interface EditorProblems {
  /** "Seçtiğim dersler" with no course chosen */
  courses: boolean;
  expires: ExpiryProblem | null;
}

export function editorProblems(
  draft: EditorDraft,
  group: GroupView | null,
  catalog: Catalog,
  held: Pick<HeldPermissions, "expiresAt">,
  ctx: Parameters<typeof expiryOf>[2]
): EditorProblems {
  const limited = limitedCourses(draft, group, catalog);
  return {
    courses: limited !== null && limited.length === 0,
    expires: expiryOf(draft, held, ctx).problem,
  };
}

export const hasProblem = (problems: EditorProblems): boolean =>
  problems.courses || problems.expires !== null;

/** The body of the PUT: the group, the single permissions beyond it, the courses and the end. */
export interface PermissionsRequest {
  groupId: string | null;
  permissions: string[];
  courseIds: string[] | null;
  expiresAt: string | null;
}

export function editorRequest(
  draft: EditorDraft,
  group: GroupView | null,
  catalog: Catalog,
  held: Pick<HeldPermissions, "expiresAt">,
  ctx: Parameters<typeof expiryOf>[2]
): PermissionsRequest {
  return {
    groupId: group?.id ?? null,
    permissions: inCatalogOrder(
      catalog,
      draft.extras.filter((code) => !isLocked(code, group))
    ),
    courseIds: limitedCourses(draft, group, catalog),
    expiresAt: expiryOf(draft, held, ctx).at,
  };
}

/** The footer of nazir 06: "Gruptan 4 izin ve 1 ek izin". */
export function editorSummary(
  counts: { group: number; extra: number },
  t: Messages
): string {
  if (counts.group === 0 && counts.extra === 0) {
    return t("Editor.summary.none");
  }
  if (counts.group === 0) {
    return t("Editor.summary.single", { count: counts.extra });
  }
  return counts.extra === 0
    ? t("Editor.summary.group", { group: counts.group })
    : t("Editor.summary.groupAndExtra", {
        group: counts.group,
        extra: counts.extra,
      });
}

// ---- the groups (nazir 16) ------------------------------------------------------

export type GroupScope = MadrasahPermissionGroupResponse["scope"];

export const GROUP_NAME_MAX = 80;

export interface GroupDraft {
  name: string;
  scope: GroupScope;
  permissions: readonly string[];
}

export const emptyGroup = (): GroupDraft => ({
  name: "",
  scope: "MADRASAH",
  permissions: [],
});

export const draftOfGroup = (group: GroupView): GroupDraft => ({
  name: group.name,
  scope: group.scope,
  permissions: group.permissions,
});

/** "Ders" lets only course permissions in; "Medrese" lets all of them in. */
export const scopeAllows = (
  scope: GroupScope,
  catalog: Catalog,
  code: string
): boolean => scope === "MADRASAH" || !isMadrasahCode(catalog, code);

/** Changing the scope filters the list: what the new scope does not allow is unticked. */
export function withScope(
  draft: GroupDraft,
  scope: GroupScope,
  catalog: Catalog
): GroupDraft {
  return {
    ...draft,
    scope,
    permissions: draft.permissions.filter((code) =>
      scopeAllows(scope, catalog, code)
    ),
  };
}

export function toggleCode(
  draft: GroupDraft,
  code: string,
  on: boolean
): GroupDraft {
  const rest = draft.permissions.filter((held) => held !== code);
  return { ...draft, permissions: on ? [...rest, code] : rest };
}

export const nameProblem = (name: string): "required" | "long" | null => {
  const trimmed = name.trim();
  if (trimmed === "") return "required";
  return trimmed.length > GROUP_NAME_MAX ? "long" : null;
};

export interface GroupProblems {
  name: "required" | "long" | null;
  /** a group holds at least one permission */
  permissions: boolean;
}

export const groupProblems = (draft: GroupDraft): GroupProblems => ({
  name: nameProblem(draft.name),
  permissions: draft.permissions.length === 0,
});

export const groupValid = (draft: GroupDraft): boolean => {
  const problems = groupProblems(draft);
  return problems.name === null && !problems.permissions;
};

export function groupBody(
  draft: GroupDraft,
  catalog: Catalog
): CreateMadrasahPermissionGroupDto {
  return {
    name: draft.name.trim(),
    scope: draft.scope,
    permissions: inCatalogOrder(catalog, draft.permissions),
  };
}

/** Only what changed, as the PATCH takes it; null when nothing did. */
export interface GroupPatch {
  name?: string;
  permissions?: string[];
}

export function groupPatch(
  group: GroupView,
  draft: GroupDraft,
  catalog: Catalog
): GroupPatch | null {
  const patch: GroupPatch = {};
  const name = draft.name.trim();
  if (name !== group.name) patch.name = name;
  const permissions = inCatalogOrder(catalog, draft.permissions);
  if (!sameCodes(permissions, group.permissions)) {
    patch.permissions = permissions;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/** Changing permissions while people hold the group asks what becomes of them (_kurallar 16); a rename never does. */
export const needsUsersAnswer = (
  group: Pick<GroupView, "userCount">,
  patch: GroupPatch
): boolean => patch.permissions !== undefined && group.userCount > 0;

/** How many people hold the group, as a 400 USERS_POLICY_REQUIRED says (`context.userCount`). */
export function userCountOf(errorBody: unknown): number | undefined {
  const body = errorBody as {
    context?: { userCount?: unknown };
    details?: { userCount?: unknown };
  } | null;
  const count = body?.context?.userCount ?? body?.details?.userCount;
  return typeof count === "number" ? count : undefined;
}

/** The result of a group write; a refusal for want of an answer carries how many people hold the group. */
export type GroupOutcome =
  | { success: true }
  | { success: false; code: string; userCount?: number };

/** The permissions of a card, as words: the first few, then how many more. */
export function groupSummary(
  permissions: readonly string[],
  t: Messages,
  shown = 4
): string {
  const words = permissions
    .slice(0, shown)
    .map((code) => permissionLabel(code, t));
  const more = permissions.length - words.length;
  return [
    ...words,
    ...(more > 0 ? [t("Groups.more", { count: more })] : []),
  ].join(" · ");
}
