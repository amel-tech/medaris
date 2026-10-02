"use client";

import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { useTranslations } from "next-intl";

/**
 * A medrese that does not exist (design tedris/03, "Hata/404 -> 38 Sayfa
 * bulunamadı"). The shared 38 page lands with the system-pages package; until
 * then the segment answers with the kit's own state, still HTTP 404.
 *
 * Client component on purpose: the kit's Button carries onClick/onKeyDown and
 * has no "use client" of its own, so a server component cannot hand it to
 * SystemState as a prop.
 */
export default function MadrasahNotFound() {
  const t = useTranslations("tedris");
  return (
    <SystemState
      className="font-ui"
      title={t("MadrasahPage.notFoundTitle")}
      action={<Button href="/home">{t("MadrasahPage.notFoundAction")}</Button>}
    >
      {t("MadrasahPage.notFoundText")}
    </SystemState>
  );
}
