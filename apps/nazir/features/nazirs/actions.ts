"use server";

import type {
  DismissMadrasahNazirDecisionDto,
  MadrasahNazirGivenResponse,
} from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";
import { type PickedPerson, pickedPerson } from "./nazirs";

export type LookupOutcome =
  | { kind: "found"; person: PickedPerson }
  | { kind: "none" }
  | { kind: "unavailable" };

/**
 * The search of "Medrese nazırı ata" (`GET /users/lookup`): an exact e-mail
 * address against the realm's directory. The API writes every call to the audit
 * log, so the dialog searches on Enter, not on every key. Finding no one is an
 * answer; a directory that cannot be reached is "şu an yapılamıyor".
 */
export async function lookupPerson(email: string): Promise<LookupOutcome> {
  const result = await authenticatedAction((api) =>
    api.users.lookupUser({ email: email.trim() })
  );
  if (!result.success) {
    console.error("Error looking a user up:", result.error);
    return { kind: "unavailable" };
  }
  const [user] = result.data;
  return user
    ? { kind: "found", person: pickedPerson(user) }
    : { kind: "none" };
}

/** "Ata": the person becomes a nazır of the medrese with no permission (`POST /madrasahs/:id/nazirs/:userId`; again is a no-op). */
export async function appointNazir(
  madrasahId: string,
  userId: string
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.madrasahs.addMadrasahNazir({ id: madrasahId, userId });
    return null;
  });
  if (!result.success) console.error("Error appointing:", result.error);
  return outcomeOf(result);
}

/** What the nazır gave to whom in the medrese and its courses, which the dismissal asks about. */
export async function getNazirGrants(
  madrasahId: string,
  userId: string
): Promise<ActionOutcome<MadrasahNazirGivenResponse[]>> {
  const result = await authenticatedAction((api) =>
    api.madrasahs.getMadrasahNazirGrants({ id: madrasahId, userId })
  );
  if (!result.success)
    console.error("Error fetching what the nazır gave:", result.error);
  return outcomeOf(result);
}

/** "Görevden al": one decision for every person listed, all or nothing (`DELETE /madrasahs/:id/nazirs/:userId`). */
export async function dismissNazir(
  madrasahId: string,
  userId: string,
  decisions: DismissMadrasahNazirDecisionDto[]
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.madrasahs.removeMadrasahNazir({
      id: madrasahId,
      userId,
      dismissMadrasahNazirDto: { decisions },
    });
    return null;
  });
  if (!result.success) console.error("Error dismissing:", result.error);
  return outcomeOf(result);
}
