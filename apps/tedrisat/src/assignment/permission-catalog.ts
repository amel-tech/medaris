import {
  isPermissionCode,
  PERMISSIONS,
  type PermissionCode,
  ROLE_DEFAULT_PERMISSIONS,
} from "@medaris/common";

/**
 * The permission catalogue lives in `@medaris/common` (MDRS-135): the codes,
 * the scope types each applies to, what is grantable, and what each role holds
 * without a grant. This file keeps what only the screens need: how the codes
 * are sectioned and ordered where nizam and nazir print them.
 *
 * The codes are the contract with the clients: the sentence shown for a code
 * lives in the web app's messages (`account.permissions.<code>`), never here,
 * so a wording change never touches the API.
 */
export {
  isPermissionCode,
  PERMISSIONS,
  type PermissionCode,
  ROLE_DEFAULT_PERMISSIONS,
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
 * permissions a müderris holds by default that can be handed on, in the order
 * the account screen prints them. nizam/13 draws no list for these scopes;
 * this is the course half of the catalog. "Find people" and "define groups"
 * are no course work and never grantable.
 */
export const COURSE_CATALOG: readonly PermissionCode[] = [
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
  PERMISSIONS.DECK_PROPOSE_KOSK,
  PERMISSIONS.COURSE_NAZIR_ASSIGN,
];

export const PLATFORM_CODES: ReadonlySet<string> = new Set(
  PLATFORM_CATALOG.flatMap((s) => s.permissions)
);
export const COURSE_CODES: ReadonlySet<string> = new Set(COURSE_CATALOG);

/**
 * The "Medrese" section of nazir/06 and nazir/16, in print order. Held in the
 * medrese itself; no role carries them by default but the başmüderris.
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
  PERMISSIONS.MADRASAH_OFFSITE_COURSE_REQUEST,
];

/**
 * The "Medrese dersleri" section of nazir/06 and nazir/16: every course
 * permission a müderris holds by default, which a nazır of the medrese may be
 * given for its courses. The canvas prints all of them; nizam/13's
 * `COURSE_CATALOG` leaves out "find people" and "define groups", which are no
 * course work, and the medrese dialogs do not.
 */
export const MADRASAH_COURSE_CATALOG: readonly PermissionCode[] = [
  ...COURSE_CATALOG,
  PERMISSIONS.PERMISSION_GROUP_DEFINE,
  PERMISSIONS.USER_LOOKUP,
];

export const MADRASAH_CODES: ReadonlySet<string> = new Set(MADRASAH_CATALOG);
export const MADRASAH_COURSE_CODES: ReadonlySet<string> = new Set(
  MADRASAH_COURSE_CATALOG
);
