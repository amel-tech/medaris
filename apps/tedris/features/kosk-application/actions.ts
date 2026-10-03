"use server";

import type {
  CreateKoskApplicationDto,
  KoskApplicationResponse,
} from "@medaris/services/tedrisat";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";
import type { ApplicationDraft } from "./model";

/** "Başvuruyu gönder" (MDRS-166): files the application as PENDING. */
export const submitKoskApplication = async (
  draft: ApplicationDraft
): Promise<AuthenticatedActionResult<KoskApplicationResponse>> =>
  authenticatedAction((api) =>
    api.koskApplications.createKoskApplication({
      createKoskApplicationDto: {
        name: draft.name.trim(),
        field: draft.field as CreateKoskApplicationDto["field"],
        summary: draft.summary.trim(),
        reason: draft.reason.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim() || null,
      },
    })
  );
