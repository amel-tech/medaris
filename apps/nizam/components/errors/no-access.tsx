import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { getTranslations } from "next-intl/server";
import { getChiefNazimName } from "~/features/assignments/reads";
import { auth } from "~/lib/auth_options";

type Messages = (
  key: string,
  values?: Record<string, string | number>
) => string;

/**
 * "Bu bölüm için izniniz yok" (design nizam/06). One screen for a section the
 * account has no permission for and for a record that is not there: the two
 * are worded the same so the page never tells which ids exist. It names the
 * Medaris başnazımı when the directory knows who that is, and says so in
 * general terms when it does not.
 */
export async function NoAccess({ locale }: { locale: string }) {
  const [t, chiefNazim, session] = await Promise.all([
    getTranslations("nizam.NoAccess") as unknown as Promise<Messages>,
    getChiefNazimName(),
    auth(),
  ]);
  const email = session?.user?.email ?? null;

  return (
    <SystemState
      shell
      title={t("title")}
      action={
        <div className="flex flex-col items-center gap-3">
          {email ? (
            <p className="mds-caption">
              {t("account")} <code className="mds-mono">{email}</code>
            </p>
          ) : null}
          <Button href={`/${locale}`} variant="secondary">
            {t("back")}
          </Button>
        </div>
      }
    >
      {chiefNazim ? t("body", { name: chiefNazim }) : t("bodyGeneric")}
    </SystemState>
  );
}
