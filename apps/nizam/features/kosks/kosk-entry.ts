import type { MeResponse } from "@medaris/services/tedrisat";
import type { HostingRead } from "~/features/hosting/reads";

/**
 * Where `/kosks/:id` sends the person who opened it (MDRS-137). The başnazım
 * gets the management view, a köşk's nazımı its Dersler page. Anyone else who
 * tedrisat lets read the köşk's hosting rights — a Medaris nazımı holding
 * `platform.hosting_grant` — goes to Barındırma hakları, the one köşk page
 * their permission opens. nizam does not copy that permission rule (it may not
 * import the catalogue): the API's answer to the hosting read is the rule.
 */
export type KoskEntry =
  | { to: "management" }
  | { to: "dersler" }
  | { to: "hosting" }
  | { to: "forbidden" };

type Me = Pick<MeResponse, "roles"> | null;

/**
 * True when the roles alone do not settle where the person goes, so the page
 * has to ask tedrisat about the hosting rights first. A 403 and a 404 both
 * come out as "forbidden" on purpose, so a köşk that is not there leaks
 * nothing.
 */
export const needsHostingRead = (me: Me, koskId: string): boolean =>
  me !== null &&
  !me.roles.systemAdmin &&
  !me.roles.manages.some((k) => k.id === koskId);

export const koskEntry = (
  me: Me,
  koskId: string,
  rights: HostingRead<readonly unknown[]>
): KoskEntry => {
  // The roles could not be read: render the management view and let tedrisat
  // refuse each of its reads, as before.
  if (me === null || me.roles.systemAdmin) return { to: "management" };
  if (me.roles.manages.some((k) => k.id === koskId)) return { to: "dersler" };
  return Array.isArray(rights) ? { to: "hosting" } : { to: "forbidden" };
};
