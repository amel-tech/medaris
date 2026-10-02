import type { IKoskWithStats } from "./kosk.repository.interface";

/**
 * What a caller with no token may not see on a köşk (MDRS-160): the ids of the
 * people who run it. The page names its manager (`managerName`); a person's id
 * is the Keycloak `sub`, which no public page needs. Every other field is what
 * the köşk's card and page show.
 *
 * Applied by the controller, to the response of every public köşk read, and
 * only when the request carries no valid token — a token that is present but
 * invalid never gets this far (it is a 401).
 */
export const maskKoskForAnonymous = <T extends IKoskWithStats>(
  kosk: T
): Omit<T, "ownerId" | "managerIds"> & {
  ownerId: null;
  managerIds: string[];
} => ({ ...kosk, ownerId: null, managerIds: [] });
