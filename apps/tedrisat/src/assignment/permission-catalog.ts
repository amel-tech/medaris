import {
  ASSIGNED_ROLES,
  type AssignedRole,
} from "../database/schema/role-assignment.schema";

/**
 * The permissions a role or a grant can carry (MDRS-169). The codes are the
 * contract with the clients: the sentence shown for a code lives in the web
 * app's messages (`account.permissions.<code>`), not here, so a wording change
 * never touches the API.
 *
 * The lists below come from the account screen (tedris 43), which spells out
 * what a köşk nazımı and a müderris hold by default. The other four roles have
 * no default text anywhere yet, so they hold nothing by default and get what
 * they are given through grants.
 */
export const PERMISSIONS = {
  KOSK_MANAGE: "kosk.manage",
  KOSK_HOSTING: "kosk.hosting",
  COURSE_OPEN_STANDALONE: "course.open_standalone",
  COURSE_MANAGE_ALL: "course.manage_all",
  BAN_MANAGE_KOSK: "ban.manage_kosk",
  DECK_MANAGE_KOSK: "deck.manage_kosk",
  COURSE_NAZIR_ASSIGN_KOSK: "course_nazir.assign_kosk",
  USER_LOOKUP: "user.lookup",

  COURSE_EDIT: "course.edit",
  SESSION_MANAGE: "session.manage",
  SESSION_LIVE_LINK: "session.live_link",
  WEEK_HIDE: "week.hide",
  COURSE_SETTINGS: "course.settings",
  COURSE_PUBLISH: "course.publish",
  COURSE_VIEW_UNPUBLISHED: "course.view_unpublished",
  ENROLLMENT_DECIDE: "enrollment.decide",
  ENROLLMENT_REMOVE: "enrollment.remove",
  ENROLLMENT_COMPLETE: "enrollment.complete",
  RECORDING_MANAGE: "recording.manage",
  RECORDING_UPLOAD: "recording.upload",
  RECORDING_WATCH_RESTRICTED: "recording.watch_restricted",
  SESSION_VIEW_CONTENT: "session.view_content",
  BAN_COURSE: "ban.course",
  BAN_LIFT_COURSE: "ban.lift_course",
  DECK_MANAGE_COURSE: "deck.manage_course",
  COURSE_NAZIR_ASSIGN: "course_nazir.assign",
  PERMISSION_GROUP_DEFINE: "permission_group.define",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const CATALOG: ReadonlySet<string> = new Set(Object.values(PERMISSIONS));

export function isPermissionCode(value: string): value is PermissionCode {
  return CATALOG.has(value);
}

const KOSK_NAZIM_DEFAULTS: readonly PermissionCode[] = [
  PERMISSIONS.KOSK_MANAGE,
  PERMISSIONS.KOSK_HOSTING,
  PERMISSIONS.COURSE_OPEN_STANDALONE,
  PERMISSIONS.COURSE_MANAGE_ALL,
  PERMISSIONS.BAN_MANAGE_KOSK,
  PERMISSIONS.DECK_MANAGE_KOSK,
  PERMISSIONS.COURSE_NAZIR_ASSIGN_KOSK,
  PERMISSIONS.USER_LOOKUP,
];

const MUDERRIS_DEFAULTS: readonly PermissionCode[] = [
  PERMISSIONS.COURSE_EDIT,
  PERMISSIONS.SESSION_MANAGE,
  PERMISSIONS.SESSION_LIVE_LINK,
  PERMISSIONS.WEEK_HIDE,
  PERMISSIONS.COURSE_SETTINGS,
  PERMISSIONS.COURSE_PUBLISH,
  PERMISSIONS.COURSE_VIEW_UNPUBLISHED,
  PERMISSIONS.ENROLLMENT_DECIDE,
  PERMISSIONS.ENROLLMENT_REMOVE,
  PERMISSIONS.ENROLLMENT_COMPLETE,
  PERMISSIONS.RECORDING_MANAGE,
  PERMISSIONS.RECORDING_UPLOAD,
  PERMISSIONS.RECORDING_WATCH_RESTRICTED,
  PERMISSIONS.SESSION_VIEW_CONTENT,
  PERMISSIONS.BAN_COURSE,
  PERMISSIONS.BAN_LIFT_COURSE,
  PERMISSIONS.DECK_MANAGE_COURSE,
  PERMISSIONS.COURSE_NAZIR_ASSIGN,
  PERMISSIONS.PERMISSION_GROUP_DEFINE,
  PERMISSIONS.USER_LOOKUP,
];

export const ROLE_DEFAULT_PERMISSIONS: Record<
  AssignedRole,
  readonly PermissionCode[]
> = {
  [ASSIGNED_ROLES.MEDARIS_NAZIM]: [],
  [ASSIGNED_ROLES.KOSK_NAZIM]: KOSK_NAZIM_DEFAULTS,
  [ASSIGNED_ROLES.MEDRESE_BASMUDERRIS]: [],
  [ASSIGNED_ROLES.MEDRESE_NAZIR]: [],
  [ASSIGNED_ROLES.MUDERRIS]: MUDERRIS_DEFAULTS,
  [ASSIGNED_ROLES.DERS_NAZIR]: [],
};
