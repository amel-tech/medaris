/** What Hesap (design tedris/34, MDRS-166) decides in the browser, kept out of the components so it can be tested. */

export type ZoneId =
  | "istanbul"
  | "berlin"
  | "amsterdam"
  | "brussels"
  | "paris"
  | "vienna"
  | "london"
  | "newYork";

/** The eight zones the design lists, in its order; "Diğer…" opens the full list. */
export const TIME_ZONE_PRESETS: ReadonlyArray<{ id: ZoneId; zone: string }> = [
  { id: "istanbul", zone: "Europe/Istanbul" },
  { id: "berlin", zone: "Europe/Berlin" },
  { id: "amsterdam", zone: "Europe/Amsterdam" },
  { id: "brussels", zone: "Europe/Brussels" },
  { id: "paris", zone: "Europe/Paris" },
  { id: "vienna", zone: "Europe/Vienna" },
  { id: "london", zone: "Europe/London" },
  { id: "newYork", zone: "America/New_York" },
];

/** The value the select holds while "Diğer…" is chosen. */
export const OTHER_ZONE = "__other";
export const DEFAULT_ZONE = "Europe/Istanbul";

/** The select value for a saved zone: the preset it is, or "Diğer…" for any other. */
export function zoneChoice(saved: string | null | undefined): string {
  const zone = saved || DEFAULT_ZONE;
  return TIME_ZONE_PRESETS.some((p) => p.zone === zone) ? zone : OTHER_ZONE;
}

/** Every IANA zone this runtime knows, for "Diğer…"; the presets' own zones when it cannot list them. */
export function allTimeZones(): string[] {
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    if (supported?.length) return supported;
  } catch {
    // Fall through to the presets.
  }
  return TIME_ZONE_PRESETS.map((p) => p.zone);
}

export type NameErrors = { givenName?: "required"; familyName?: "required" };

/** Ad and soyad are both required; a blank one blocks the save (criterion 2). */
export function validateName(
  givenName: string,
  familyName: string
): NameErrors {
  const errors: NameErrors = {};
  if (!givenName.trim()) errors.givenName = "required";
  if (!familyName.trim()) errors.familyName = "required";
  return errors;
}
