/**
 * The codes whose sentence carries a second, smaller line on the account
 * screen (tedris 43). <key> is `permissionMessageKey(code)`. The sentence itself is `AccountPage.permissions.<key>`
 * and the note `AccountPage.permissionNotes.<key>`; a code that is in this
 * set must have both.
 */
export const PERMISSION_NOTE_CODES: ReadonlySet<string> = new Set([
  "course.manage_all",
  "course_nazir.assign_kosk",
  "user.lookup",
  "ban.lift_course",
]);

/** The roles whose default permissions the screen explains under the list. */
export const ROLE_DEFAULTS_NOTE: ReadonlySet<string> = new Set([
  "KOSK_NAZIM",
  "MUDERRIS",
]);

/** next-intl keys cannot hold a dot, so `kosk.manage` is `kosk_manage` in the messages. */
export const permissionMessageKey = (code: string): string =>
  code.replaceAll(".", "_");
