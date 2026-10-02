"use server";

import type { MyPublicProfileResponse } from "@medaris/services/tedrisat";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";
import type { Gender, Visibility } from "./model";

/** "Kaydet": the künye, gender, city and about texts (MDRS-166). */
export const saveProfileTexts = async (texts: {
  kunye: string;
  gender: Gender | null;
  city: string;
  about: string;
}): Promise<AuthenticatedActionResult<MyPublicProfileResponse>> =>
  authenticatedAction((api) =>
    api.me.updateMyPublicProfile({
      updatePublicProfileDto: {
        kunye: texts.kunye.trim(),
        gender: texts.gender,
        city: texts.city.trim() || null,
        about: texts.about.trim() || null,
      },
    })
  );

/** A switch: saved the moment it flips, on its own (MDRS-166). */
export const saveVisibility = async (
  visibility: Partial<Visibility>
): Promise<AuthenticatedActionResult<MyPublicProfileResponse>> =>
  authenticatedAction((api) =>
    api.me.updateMyPublicProfile({
      updatePublicProfileDto: { visibility },
    })
  );
