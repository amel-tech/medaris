"use client";

import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { useTranslations } from "next-intl";

/**
 * A session that does not exist, or that the caller may not see (design
 * tedris/15, "Hata/404 -> 38"). The shared 38 page lands with the system-pages
 * package; until then the segment answers with the kit's own state, still
 * HTTP 404. Client component for the same reason as the medrese one: the kit's
 * Button carries handlers and cannot be handed to SystemState from the server.
 */
export default function SessionNotFound() {
  const t = useTranslations("tedris");
  return (
    <SystemState
      className="font-ui"
      title={t("SessionPage.notFoundTitle")}
      action={<Button href="/home">{t("SessionPage.notFoundAction")}</Button>}
    >
      {t("SessionPage.notFoundText")}
    </SystemState>
  );
}
