import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { getTranslations } from "next-intl/server";

/**
 * "Sayfa bulunamadı": an address no page of the app answers (MDRS-211). It is
 * not "Bu bölüm için izniniz yok" (nizam/06), which stays for a section the
 * account may not open and for a record `notFound()` was called for: those
 * two look alike so the page never tells which ids exist. A path no route
 * matches tells nothing about any record, so saying that the page is not
 * there is both true and safe, and does not send the nazım to the başnazım
 * for a permission no one can give.
 */
export async function PageNotFound({ locale }: { locale: string }) {
  const t = await getTranslations("nizam.PageNotFound");

  return (
    <SystemState
      shell
      title={t("title")}
      action={
        <Button href={`/${locale}`} variant="secondary">
          {t("back")}
        </Button>
      }
    >
      {t("body")}
    </SystemState>
  );
}
