import {
  ASSIGNED_ROLES,
  type AssignedRole,
  SCOPE_TYPES,
  type ScopeType,
} from "./assignments";

/**
 * The permission catalogue (MDRS-135). One code is one thing a person may do;
 * the sentence a screen shows for it lives in the web apps' messages
 * (`account.permissions.<code>`), never here, so a wording change touches no
 * API.
 *
 * Three kinds of code share this list:
 *
 * - **Listed** codes are what the screens draw and what a role or a grant
 *   carries. Each says the scope types it applies to (`scopes`) and whether it
 *   can be handed on (`grantable`).
 * - **Implicit** codes (`implicit: true`) are held by a relationship, not by a
 *   grant: anyone may view a public course page, a talebe enrolled in a course
 *   reads its content, a deck's author manages it. No screen lists them, no
 *   grant carries them, and a role default never adds one.
 * - **Derived** codes (`derivedFrom`) are an ability inside another
 *   permission that a policy can switch off on its own: a course's settings
 *   holder may turn "enrolment needs approval" off only while no policy above
 *   the course says it always does.
 *
 * Starts from the 33 scopes the matrix of MDRS-41/43 spoke in and from the 62
 * codes MDRS-169 and MDRS-171 gave the account and permission screens; the
 * scopes no handler asks for (homework, exams, annotations, donations, the
 * ijazah row) are not carried over and come back with their features.
 */
export const PERMISSIONS = {
  // --- köşk -----------------------------------------------------------------
  KOSK_MANAGE: "kosk.manage",
  KOSK_HOSTING: "kosk.hosting",
  COURSE_OPEN_STANDALONE: "course.open_standalone",
  COURSE_MANAGE_ALL: "course.manage_all",
  /** Ban at the köşk, and lift a ban: held by the level that imposed it and by every level above (MDRS-113). */
  BAN_MANAGE_KOSK: "ban.manage_kosk",
  DECK_MANAGE_KOSK: "deck.manage_kosk",
  COURSE_NAZIR_ASSIGN_KOSK: "course_nazir.assign_kosk",
  USER_LOOKUP: "user.lookup",
  /**
   * Hide and restore a course the köşk hosts, whoever opened it (MDRS-124; the
   * owner's 1 October list gives a köşk nazımı "hide" in a medrese course too).
   * A role default no screen draws: the canvases have no sentence for it.
   */
  COURSE_HIDE: "course.hide",

  // --- course ---------------------------------------------------------------
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
  /** Propose a deck of the course to its köşk (MDRS-47). */
  DECK_PROPOSE_KOSK: "deck.propose_kosk",
  COURSE_NAZIR_ASSIGN: "course_nazir.assign",
  PERMISSION_GROUP_DEFINE: "permission_group.define",
  /** Hand a permission to someone: only ever a role default, never itself handed on. */
  PERMISSION_GRANT: "permission.grant",

  // --- Medaris (platform) ----------------------------------------------------
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

  // --- medrese ---------------------------------------------------------------
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
  /** Ask a köşk to host a non-medrese course of the medrese (MDRS-136). */
  MADRASAH_OFFSITE_COURSE_REQUEST: "madrasah.offsite_course_request",

  // --- implicit: held by a relationship, listed nowhere ----------------------
  COURSE_VIEW: "course.view",
  COURSE_VIEW_DETAILS: "course.view_details",
  COURSE_ENROLL: "course.enroll",
  /** The course staff's read of its talebeler and their e-mails: "bu ayrı bir izin değildir" (tedris/43). */
  COURSE_STAFF_READ: "course.staff_read",
  KOSK_VIEW: "kosk.view",
  MADRASAH_VIEW: "madrasah.view",
  DECK_VIEW: "deck.view",
  DECK_CREATE_CARD: "deck.create_card",
  DECK_MANAGE_CARDS: "deck.manage_cards",
  DECK_CREATE_PRIVATE: "deck.create_private",
  DECK_MANAGE_PRIVATE: "deck.manage_private",
  /** Deleting for real is the başnazım's alone: no role, grant or relationship holds these. */
  COURSE_DELETE: "course.delete",
  KOSK_DELETE: "kosk.delete",
  MADRASAH_DELETE: "madrasah.delete",

  // --- derived: an ability a policy can close ---------------------------------
  /** Let a course take talebeler without approval. Closed by "Kayıt her zaman onaylı". */
  SETTING_APPROVAL_OFF: "setting.approval_off",
  /** Let a course's recordings be public. Closed by "Kayıtlar hiçbir zaman herkese açık olmaz". */
  SETTING_RECORDINGS_PUBLIC: "setting.recordings_public",
  /** Let a course stay open to the public. Closed by "Ders kapalı olmalı". */
  SETTING_COURSE_OPEN: "setting.course_open",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface IPermissionMeta {
  /**
   * The scope types the permission is held in. Nesting reaches downwards: a
   * course-scoped code held in a köşk or a medrese is held in its courses.
   * Empty for implicit and derived codes.
   */
  scopes: readonly ScopeType[];
  /** Whether a grant or a group may carry it. */
  grantable: boolean;
  /**
   * Content of a scope: what a passive scope closes to everyone but the
   * platform's own management (MDRS-136). Page-level reads are not content.
   */
  content: boolean;
  /**
   * A köşk-level holder does not hold this in a course the köşk hosts for a
   * medrese: "Open a course for a medrese" and "add or remove a müderris, move
   * the imam on a medrese course" belong to the medrese (owner, 1 October).
   */
  notInMadrasahCourse?: boolean;
  /**
   * A role default no screen draws and no grant carries: the permission to give
   * permissions ("Size verilen bir izni başkasına veremezsiniz" is a rule the
   * screens state, not a line they list) and the köşk nazımı's hiding of a
   * course. Held by roles only, never handed on, never printed in a list.
   */
  unlisted?: boolean;
  /** Implicit codes are held through a relationship, not a role or a grant. */
  implicit?: boolean;
  /** Derived codes ride on another permission. */
  derivedFrom?: PermissionCode;
}

const { PLATFORM, KOSK, MADRASAH, COURSE } = SCOPE_TYPES;

const listed = (
  scopes: readonly ScopeType[],
  extra: Partial<IPermissionMeta> = {}
): IPermissionMeta => ({
  scopes,
  grantable: true,
  content: false,
  ...extra,
});
const implicit = (extra: Partial<IPermissionMeta> = {}): IPermissionMeta => ({
  scopes: [],
  grantable: false,
  content: false,
  implicit: true,
  ...extra,
});

const P = PERMISSIONS;

/** Everything the catalogue knows about each code. */
export const PERMISSION_META: Record<PermissionCode, IPermissionMeta> = {
  [P.KOSK_MANAGE]: listed([KOSK]),
  [P.KOSK_HOSTING]: listed([KOSK]),
  [P.COURSE_OPEN_STANDALONE]: listed([KOSK], { notInMadrasahCourse: true }),
  [P.COURSE_MANAGE_ALL]: listed([KOSK]),
  [P.BAN_MANAGE_KOSK]: listed([KOSK]),
  [P.DECK_MANAGE_KOSK]: listed([KOSK]),
  [P.COURSE_NAZIR_ASSIGN_KOSK]: listed([KOSK]),
  [P.USER_LOOKUP]: listed([KOSK, COURSE]),
  [P.COURSE_HIDE]: listed([KOSK], { grantable: false, unlisted: true }),

  [P.COURSE_EDIT]: listed([COURSE], { content: true }),
  [P.SESSION_MANAGE]: listed([COURSE], { content: true }),
  [P.SESSION_LIVE_LINK]: listed([COURSE], { content: true }),
  [P.WEEK_HIDE]: listed([COURSE], { content: true }),
  [P.COURSE_SETTINGS]: listed([COURSE]),
  [P.COURSE_PUBLISH]: listed([COURSE]),
  [P.COURSE_VIEW_UNPUBLISHED]: listed([COURSE], { content: true }),
  [P.ENROLLMENT_DECIDE]: listed([COURSE], { content: true }),
  [P.ENROLLMENT_REMOVE]: listed([COURSE], { content: true }),
  [P.ENROLLMENT_COMPLETE]: listed([COURSE], { content: true }),
  [P.RECORDING_MANAGE]: listed([COURSE], { content: true }),
  [P.RECORDING_UPLOAD]: listed([COURSE], { content: true }),
  [P.RECORDING_WATCH_RESTRICTED]: listed([COURSE], { content: true }),
  [P.SESSION_VIEW_CONTENT]: listed([COURSE], { content: true }),
  [P.BAN_COURSE]: listed([COURSE]),
  [P.BAN_LIFT_COURSE]: listed([COURSE]),
  [P.DECK_MANAGE_COURSE]: listed([COURSE]),
  [P.DECK_PROPOSE_KOSK]: listed([COURSE]),
  [P.COURSE_NAZIR_ASSIGN]: listed([COURSE]),
  [P.PERMISSION_GROUP_DEFINE]: listed([COURSE]),
  [P.PERMISSION_GRANT]: listed([KOSK, MADRASAH, COURSE], {
    grantable: false,
    unlisted: true,
  }),

  [P.PLATFORM_KOSK_CREATE]: listed([PLATFORM]),
  [P.PLATFORM_KOSK_NAZIM_MANAGE]: listed([PLATFORM]),
  [P.PLATFORM_KOSK_EDIT]: listed([PLATFORM]),
  [P.PLATFORM_HOSTING_GRANT]: listed([PLATFORM]),
  [P.PLATFORM_MADRASAH_CREATE]: listed([PLATFORM]),
  [P.PLATFORM_HEAD_MUDERRIS_MANAGE]: listed([PLATFORM]),
  [P.PLATFORM_MADRASAH_EDIT]: listed([PLATFORM]),
  [P.PLATFORM_MADRASAH_NAZIR_GRANT]: listed([PLATFORM]),
  [P.PLATFORM_KOSK_APPLICATION_DECIDE]: listed([PLATFORM]),
  [P.PLATFORM_DECK_PUBLISH]: listed([PLATFORM]),
  [P.PLATFORM_APPEAL_DECIDE]: listed([PLATFORM]),
  [P.PLATFORM_BAN_SCOPED]: listed([PLATFORM]),
  [P.PLATFORM_BAN_ACCOUNT]: listed([PLATFORM]),
  [P.PLATFORM_AUDIT_READ]: listed([PLATFORM]),
  [P.PLATFORM_INACTIVE_SCOPES_MANAGE]: listed([PLATFORM]),
  [P.PLATFORM_YOUTUBE_MANAGE]: listed([PLATFORM]),
  [P.PLATFORM_POLICY_EDIT]: listed([PLATFORM]),

  [P.MADRASAH_COURSE_OPEN]: listed([MADRASAH]),
  [P.MADRASAH_MUDERRIS_MANAGE]: listed([MADRASAH]),
  [P.MADRASAH_STUDENTS_VIEW]: listed([MADRASAH]),
  [P.MADRASAH_BAN]: listed([MADRASAH]),
  [P.MADRASAH_COURSE_HIDE]: listed([MADRASAH]),
  [P.MADRASAH_ADMISSION_RULES]: listed([MADRASAH]),
  [P.MADRASAH_APPEAL_OPEN]: listed([MADRASAH]),
  [P.MADRASAH_PERMANENT_BAN_REQUEST]: listed([MADRASAH]),
  [P.MADRASAH_SETTINGS_EDIT]: listed([MADRASAH]),
  [P.MADRASAH_NAZIR_APPOINT]: listed([MADRASAH]),
  [P.MADRASAH_OFFSITE_COURSE_REQUEST]: listed([MADRASAH]),

  [P.COURSE_VIEW]: implicit(),
  [P.COURSE_VIEW_DETAILS]: implicit({ content: true }),
  [P.COURSE_ENROLL]: implicit(),
  [P.COURSE_STAFF_READ]: implicit({ content: true }),
  [P.KOSK_VIEW]: implicit(),
  [P.MADRASAH_VIEW]: implicit(),
  [P.DECK_VIEW]: implicit(),
  [P.DECK_CREATE_CARD]: implicit(),
  [P.DECK_MANAGE_CARDS]: implicit(),
  [P.DECK_CREATE_PRIVATE]: implicit(),
  [P.DECK_MANAGE_PRIVATE]: implicit(),
  [P.COURSE_DELETE]: implicit(),
  [P.KOSK_DELETE]: implicit(),
  [P.MADRASAH_DELETE]: implicit(),

  [P.SETTING_APPROVAL_OFF]: implicit({ derivedFrom: P.COURSE_SETTINGS }),
  [P.SETTING_RECORDINGS_PUBLIC]: implicit({ derivedFrom: P.COURSE_SETTINGS }),
  [P.SETTING_COURSE_OPEN]: implicit({ derivedFrom: P.COURSE_SETTINGS }),
};

const CATALOG: ReadonlySet<string> = new Set(Object.values(PERMISSIONS));

export function isPermissionCode(value: string): value is PermissionCode {
  return CATALOG.has(value);
}

/** The codes a screen lists and a grant may carry. */
export const LISTED_CODES: readonly PermissionCode[] = (
  Object.values(PERMISSIONS) as PermissionCode[]
).filter(
  (code) => !PERMISSION_META[code].implicit && !PERMISSION_META[code].unlisted
);

/** The codes a grant or a group may carry. */
export const GRANTABLE_CODES: ReadonlySet<string> = new Set(
  LISTED_CODES.filter((code) => PERMISSION_META[code].grantable)
);

/** Every code of the catalogue tagged for one of the scope types, unlisted ones included. */
const codesWith = (...types: ScopeType[]): PermissionCode[] =>
  (Object.values(PERMISSIONS) as PermissionCode[]).filter(
    (code) =>
      !PERMISSION_META[code].implicit &&
      PERMISSION_META[code].scopes.some((scope) => types.includes(scope))
  );

/**
 * What each role holds without any grant (MDRS-135 §3), computed from the
 * catalogue's scope tags so a new code lands in the right defaults by being
 * tagged, not by being added to a list:
 *
 * - a köşk nazımı: every köşk- and course-scoped code, in its köşk and the
 *   courses held there;
 * - a başmüderris: every medrese- and course-scoped code, in its medrese and
 *   its courses;
 * - a müderris: every course-scoped code, in its course;
 * - the Medaris nazımı, the medrese nazırı and the ders nazırı: nothing.
 *   They hold only what is granted to them.
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<
  AssignedRole,
  readonly PermissionCode[]
> = {
  [ASSIGNED_ROLES.MEDARIS_NAZIM]: [],
  [ASSIGNED_ROLES.KOSK_NAZIM]: codesWith(KOSK, COURSE),
  [ASSIGNED_ROLES.MEDRESE_BASMUDERRIS]: codesWith(MADRASAH, COURSE),
  [ASSIGNED_ROLES.MEDRESE_NAZIR]: [],
  [ASSIGNED_ROLES.MUDERRIS]: codesWith(COURSE),
  [ASSIGNED_ROLES.DERS_NAZIR]: [],
};

/**
 * What a role holds in a scope of `type` itself, for the screens that list a
 * person's permissions scope by scope: the role's defaults tagged for that
 * kind of scope. The course work a köşk nazımı holds in its köşk's courses
 * arrives by nesting (`effectivePermissions`) and is not repeated under the
 * köşk.
 */
export function roleCodesAt(
  role: AssignedRole,
  type: ScopeType
): readonly PermissionCode[] {
  return ROLE_DEFAULT_PERMISSIONS[role].filter(
    (code) =>
      !PERMISSION_META[code].unlisted &&
      PERMISSION_META[code].scopes.includes(type)
  );
}
