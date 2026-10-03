import { PERMISSIONS } from "../assignment/permission-catalog";

/** What the Medaris home page draws for one viewer (nizam/01 and 05). */
export interface IDashboardSections {
  /** The başnazım's alone: opening a köşk is SYSTEM_ADMIN's (stack-44), the permission is not read there. */
  openKosk: boolean;
  applications: boolean;
  deckRequests: boolean;
  appeals: boolean;
  permanentBans: boolean;
  bans: boolean;
  inactiveScopes: boolean;
  /** Ders and Kayıtlı talebe: the başnazım's alone (05 draws neither). */
  courseNumbers: boolean;
}

/**
 * Which sections a viewer is shown. The başnazım sees them all; a Medaris
 * nazımı sees what the platform permissions they hold open, and never the
 * course numbers. Pure on purpose: the rule is exercised without a database.
 */
export function sectionsFor(
  chief: boolean,
  held: ReadonlySet<string>
): IDashboardSections {
  const has = (code: string) => chief || held.has(code);
  return {
    openKosk: chief,
    applications: has(PERMISSIONS.PLATFORM_KOSK_APPLICATION_DECIDE),
    deckRequests: has(PERMISSIONS.PLATFORM_DECK_PUBLISH),
    appeals: has(PERMISSIONS.PLATFORM_APPEAL_DECIDE),
    permanentBans: has(PERMISSIONS.PLATFORM_BAN_ACCOUNT),
    bans:
      has(PERMISSIONS.PLATFORM_BAN_SCOPED) ||
      has(PERMISSIONS.PLATFORM_BAN_ACCOUNT),
    inactiveScopes: has(PERMISSIONS.PLATFORM_INACTIVE_SCOPES_MANAGE),
    courseNumbers: chief,
  };
}
