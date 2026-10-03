"use server";

import type {
  DashboardSessionTab,
  KoskDashboardResponse,
} from "@medaris/services/tedrisat";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";

/** One tab of the Celseler card (nizam 02): the whole page's numbers come back with it. */
export const loadKoskSessions = async (
  koskId: string,
  sessions: DashboardSessionTab
): Promise<AuthenticatedActionResult<KoskDashboardResponse>> =>
  authenticatedAction((api) =>
    api.kosks.getKoskDashboard({ id: koskId, sessions })
  );
