import type { IMadrasahWithNazirs } from "./madrasah.repository.interface";

/**
 * What a caller with no token may not see on a medrese (MDRS-160): who created
 * it and the ids of its nazırs. The medrese page shows the başmüderris by name
 * (`GET /madrasahs/:id/overview`), never by id. Applied by the controller, only
 * when the request carries no valid token.
 */
export const maskMadrasahForAnonymous = <T extends IMadrasahWithNazirs>(
  madrasah: T
): Omit<T, "createdBy" | "nazirIds"> & {
  createdBy: null;
  nazirIds: string[];
} => ({ ...madrasah, createdBy: null, nazirIds: [] });
