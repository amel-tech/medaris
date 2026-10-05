import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { getTranslations } from "next-intl/server";

/**
 * A route that is not there, and a record `notFound()` was called for. The
 * words are the same for both, so the page never tells which ids exist
 * (the same rule as nizam's 404).
 */
export default async function NotFound() {
  const t = await getTranslations("nazar.NotFound");

  return (
    <SystemState
      kind="not-found"
      title={t("title")}
      action={
        <Button href="/" variant="secondary">
          {t("back")}
        </Button>
      }
    >
      {t("text")}
    </SystemState>
  );
}
