import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { getTranslations } from "next-intl/server";

/**
 * A medrese that does not exist (design tedris/03, "Hata/404 -> 38 Sayfa
 * bulunamadı"). The shared 38 page lands with the system-pages package; until
 * then the segment answers with the kit's own state, still HTTP 404.
 */
export default async function MadrasahNotFound() {
  const t = await getTranslations("tedris");
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
