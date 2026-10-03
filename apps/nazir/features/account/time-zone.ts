import { zoneCities, zoneName } from "@medaris/ui/mds/locale";

/**
 * The zones the first list offers (nazir 20): the course zones the system
 * names, in its order, then "Diğer…" for the full IANA list.
 */
export const COMMON_ZONES: readonly string[] = Object.keys(zoneCities);

/** The value of the first list's "Diğer…" row; never a zone name. */
export const OTHER_ZONE = "other";

export const isCommonZone = (zone: string): boolean =>
  COMMON_ZONES.includes(zone);

export interface ZoneChoice {
  value: string;
  label: string;
}

export const commonZoneChoices = (otherLabel: string): ZoneChoice[] => [
  ...COMMON_ZONES.map((zone) => ({ value: zone, label: zoneName(zone) })),
  { value: OTHER_ZONE, label: otherLabel },
];

/** "America/Argentina/Buenos_Aires" as "America / Argentina / Buenos Aires". */
export const otherZoneLabel = (zone: string): string =>
  zone.replace(/_/g, " ").split("/").join(" / ");

/** The second list: every zone the runtime knows except the ones the first already offers. */
export const otherZoneChoices = (all: readonly string[]): ZoneChoice[] =>
  all
    .filter((zone) => !isCommonZone(zone))
    .map((zone) => ({ value: zone, label: otherZoneLabel(zone) }));
