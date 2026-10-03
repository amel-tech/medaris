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
 * they are given through grants. `question.answer` (MDRS-150) is on no canvas
 * yet: its sentence is the web messages' alone.
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
  QUESTION_ANSWER: "question.answer",
  BAN_COURSE: "ban.course",
  BAN_LIFT_COURSE: "ban.lift_course",
  DECK_MANAGE_COURSE: "deck.manage_course",
  COURSE_NAZIR_ASSIGN: "course_nazir.assign",
  PERMISSION_GROUP_DEFINE: "permission_group.define",

  // What the Medaris başnazımı can hand to a Medaris nazımı (MDRS-171,
  // nizam/12 and 13): the platform's own catalog, in the five sections the
  // screens draw. No role holds these by default.
  PLATFORM_KOSK_CREATE: "platform.kosk_create",
  PLATFORM_KOSK_NAZIM_MANAGE: "platform.kosk_nazim_manage",
  PLATFORM_KOSK_EDIT: "platform.kosk_edit",
  PLATFORM_HOSTING_GRANT: "platform.hosting_grant",
  PLATFORM_MADRASAH_CREATE: "platform.madrasah_create",
  PLATFORM_HEAD_MUDERRIS_MANAGE: "platform.head_muderris_manage",
  PLATFORM_MADRASAH_EDIT: "platform.madrasah_edit",
  PLATFORM_MADRASAH_NAZIR_GRANT: "platform.madrasah_nazir_grant",
  PLATFORM_KOSK_APPLICATION_DECIDE: "platform.kosk_application_decide",
  PLATFORM_DECK_PUBLISH: "platform.deck_publish",
  PLATFORM_APPEAL_DECIDE: "platform.appeal_decide",
  PLATFORM_BAN_SCOPED: "platform.ban_scoped",
  PLATFORM_BAN_ACCOUNT: "platform.ban_account",
  PLATFORM_AUDIT_READ: "platform.audit_read",
  PLATFORM_INACTIVE_SCOPES_MANAGE: "platform.inactive_scopes_manage",
  PLATFORM_YOUTUBE_MANAGE: "platform.youtube_manage",
  PLATFORM_POLICY_EDIT: "platform.policy_edit",

  // What the medrese's başmüderris can hand to one of its nazırs (MDRS-185,
  // nazir/06 and 16): the "Medrese" section of both dialogs, in the order they
  // print it. The course permissions a nazır may be given are the ones above.
  MADRASAH_COURSE_OPEN: "madrasah.course_open",
  MADRASAH_MUDERRIS_MANAGE: "madrasah.muderris_manage",
  MADRASAH_STUDENTS_VIEW: "madrasah.students_view",
  MADRASAH_BAN: "madrasah.ban",
  MADRASAH_COURSE_HIDE: "madrasah.course_hide",
  MADRASAH_ADMISSION_RULES: "madrasah.admission_rules",
  MADRASAH_APPEAL_OPEN: "madrasah.appeal_open",
  MADRASAH_PERMANENT_BAN_REQUEST: "madrasah.permanent_ban_request",
  MADRASAH_SETTINGS_EDIT: "madrasah.settings_edit",
  MADRASAH_NAZIR_APPOINT: "madrasah.nazir_appoint",
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
  PERMISSIONS.QUESTION_ANSWER,
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

/**
 * The platform catalog as nizam/12 and nizam/13 section it: one entry per
 * heading, in the order the screens print them. The sentence under a code is
 * the web app's (`nizam.PermissionCatalog`), never the API's.
 */
export const PLATFORM_CATALOG: ReadonlyArray<{
  section: string;
  permissions: readonly PermissionCode[];
}> = [
  {
    section: "kosks",
    permissions: [
      PERMISSIONS.PLATFORM_KOSK_CREATE,
      PERMISSIONS.PLATFORM_KOSK_NAZIM_MANAGE,
      PERMISSIONS.PLATFORM_KOSK_EDIT,
      PERMISSIONS.PLATFORM_HOSTING_GRANT,
    ],
  },
  {
    section: "madrasahs",
    permissions: [
      PERMISSIONS.PLATFORM_MADRASAH_CREATE,
      PERMISSIONS.PLATFORM_HEAD_MUDERRIS_MANAGE,
      PERMISSIONS.PLATFORM_MADRASAH_EDIT,
      PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT,
    ],
  },
  {
    section: "requests",
    permissions: [
      PERMISSIONS.PLATFORM_KOSK_APPLICATION_DECIDE,
      PERMISSIONS.PLATFORM_DECK_PUBLISH,
      PERMISSIONS.PLATFORM_APPEAL_DECIDE,
    ],
  },
  {
    section: "bans",
    permissions: [
      PERMISSIONS.PLATFORM_BAN_SCOPED,
      PERMISSIONS.PLATFORM_BAN_ACCOUNT,
    ],
  },
  {
    section: "audit",
    permissions: [
      PERMISSIONS.PLATFORM_AUDIT_READ,
      PERMISSIONS.PLATFORM_INACTIVE_SCOPES_MANAGE,
      PERMISSIONS.PLATFORM_YOUTUBE_MANAGE,
      PERMISSIONS.PLATFORM_POLICY_EDIT,
    ],
  },
];

/**
 * What a group in the scope "Her ders" or "Bir ders" may carry: the course
 * permissions a müderris holds by default, less the two that are no course
 * work (finding people, defining groups). nizam/13 draws no list for these
 * scopes; this is the course half of the catalog above.
 */
export const COURSE_CATALOG: readonly PermissionCode[] =
  MUDERRIS_DEFAULTS.filter(
    (code) =>
      code !== PERMISSIONS.USER_LOOKUP &&
      code !== PERMISSIONS.PERMISSION_GROUP_DEFINE
  );

export const PLATFORM_CODES: ReadonlySet<string> = new Set(
  PLATFORM_CATALOG.flatMap((s) => s.permissions)
);
export const COURSE_CODES: ReadonlySet<string> = new Set(COURSE_CATALOG);

/**
 * The "Medrese" section of nazir/06 and nazir/16, in print order. Held in the
 * medrese itself; no role carries them by default.
 */
export const MADRASAH_CATALOG: readonly PermissionCode[] = [
  PERMISSIONS.MADRASAH_COURSE_OPEN,
  PERMISSIONS.MADRASAH_MUDERRIS_MANAGE,
  PERMISSIONS.MADRASAH_STUDENTS_VIEW,
  PERMISSIONS.MADRASAH_BAN,
  PERMISSIONS.MADRASAH_COURSE_HIDE,
  PERMISSIONS.MADRASAH_ADMISSION_RULES,
  PERMISSIONS.MADRASAH_APPEAL_OPEN,
  PERMISSIONS.MADRASAH_PERMANENT_BAN_REQUEST,
  PERMISSIONS.MADRASAH_SETTINGS_EDIT,
  PERMISSIONS.MADRASAH_NAZIR_APPOINT,
];

/**
 * The "Medrese dersleri" section of nazir/06 and nazir/16: every course
 * permission the müderris holds by default. nizam/13's `COURSE_CATALOG` leaves
 * two out; the medrese dialogs do not say they do.
 */
export const MADRASAH_COURSE_CATALOG: readonly PermissionCode[] =
  MUDERRIS_DEFAULTS;

export const MADRASAH_CODES: ReadonlySet<string> = new Set(MADRASAH_CATALOG);
export const MADRASAH_COURSE_CODES: ReadonlySet<string> = new Set(
  MADRASAH_COURSE_CATALOG
);
