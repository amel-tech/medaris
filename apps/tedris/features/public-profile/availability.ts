/**
 * Whether the talebe's public profile exists for people (MDRS-141). The owner
 * hid it on 4 Oct, "too early": while this is false the Hesap card with its link
 * is left out and `/account/public-profile` shows the not-found page. The editor, the
 * actions and the locale keys stay, so turning the profile back on is this one
 * line plus `API__PUBLIC_PROFILE_ENABLED=true` on the API, which answers 404
 * for the same routes until then.
 *
 * Before it is turned back on, the owner decides whether the gender is shown
 * there (owner, 2026-10-14). As built, the künye and the gender are always
 * public on it, while the privacy notice says today that the gender is not
 * shown publicly. The person's own gender is on Hesap meanwhile, read-only.
 */
export const PUBLIC_PROFILE_ENABLED: boolean = false;
