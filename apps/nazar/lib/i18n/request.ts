import { resources } from "@medaris/i18n";
import { DEFAULT_TIME_ZONE } from "@medaris/utils";
import { getRequestConfig } from "next-intl/server";

/**
 * Nazar is Turkish only at launch (canvas rule 3): no locale segment, no
 * negotiation, one catalogue. Only the app's own namespaces are loaded, which
 * keeps another app's strings from being used by accident.
 *
 * No viewer time zone is read here. Pages that print a date take the zone
 * from `GET /me` (falling back to `DEFAULT_TIME_ZONE`) and pass it to the
 * formatter themselves; the default below only keeps the server render and
 * the browser from disagreeing about a date that names no zone (MDRS-110).
 */
export default getRequestConfig(async () => ({
  locale: "tr",
  messages: { common: resources.tr.common, nazar: resources.tr.nazar },
  timeZone: DEFAULT_TIME_ZONE,
}));
