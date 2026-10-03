"use server";

import type { CreateMadrasahBanDto } from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";

/**
 * "Yasakla" of nazir 10 and 11 (`POST /madrasahs/:id/bans`): the talebe is
 * barred from one course of the medrese or from all of them. Barring someone
 * already barred in that scope answers the standing ban, so it is no error. A
 * refusal is its code (BAN_FORBIDDEN, BAN_TARGET_INVALID, COURSE_NOT_FOUND, …)
 * and the page words it.
 */
export async function banPerson(
  madrasahId: string,
  request: CreateMadrasahBanDto
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.bans.createMadrasahBan({
      id: madrasahId,
      createMadrasahBanDto: request,
    });
    return null;
  });
  if (!result.success) console.error("Error placing a ban:", result.error);
  return outcomeOf(result);
}

/** "Yasağı kaldır" (`POST /bans/:banId/lift`); the reason is written to the audit log with the caller's name. */
export async function liftBan(
  banId: string,
  reason: string
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.bans.liftBan({ banId, liftBanDto: { reason } });
    return null;
  });
  if (!result.success) console.error("Error lifting a ban:", result.error);
  return outcomeOf(result);
}

/** "Medreseden de yasakla" (`POST /bans/:banId/escalate`): a second, medrese-wide ban beside the course's, which stays. */
export async function escalateBan(
  banId: string,
  reason: string
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.bans.escalateBan({ banId, banReasonDto: { reason } });
    return null;
  });
  if (!result.success) console.error("Error widening a ban:", result.error);
  return outcomeOf(result);
}

/** "Kalıcı yasak talebi aç" (`POST /bans/:banId/permanent-request`): recorded for Medaris administration; the ban stays as it is. */
export async function requestPermanentBan(
  banId: string,
  reason: string
): Promise<ActionOutcome<null>> {
  const result = await authenticatedAction(async (api) => {
    await api.bans.requestPermanentBan({ banId, banReasonDto: { reason } });
    return null;
  });
  if (!result.success)
    console.error("Error requesting a permanent ban:", result.error);
  return outcomeOf(result);
}
