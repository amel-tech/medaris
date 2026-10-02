import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { getTranslations } from "next-intl/server";
import { FocusHeading } from "~/components/shell/focus-heading";

type Messages = (key: string) => string;

/**
 * "Yönetim yetkiniz yok" (design nizam/03): Nizam is for those who manage
 * Medaris and the köşks, and this account manages nothing. The sidebar around
 * it carries the brand and the person only. When the roles could not be read
 * the screen does not claim the account has none: it says so and offers a
 * retry.
 */
export async function NoRolePage({
  email,
  tedrisUrl,
  failed,
  retryHref,
}: {
  email: string | null;
  tedrisUrl: string | null;
  failed: boolean;
  retryHref: string;
}) {
  const t = (await getTranslations("nizam.NoRole")) as unknown as Messages;

  if (failed) {
    return (
      <section className="mx-auto flex w-full max-w-[40rem] flex-col gap-4 pbs-12">
        <Alert tone="error" title={t("errorTitle")}>
          <p>{t("errorBody")}</p>
          <Button href={retryHref} variant="outline" size="small">
            {t("retry")}
          </Button>
        </Alert>
      </section>
    );
  }

  return (
    <>
      <FocusHeading />
      <SystemState
        shell
        className="grow justify-center"
        title={t("title")}
        action={
          <div className="flex flex-col items-center gap-3">
            {email ? (
              <p className="mds-caption">
                {t("account")} <code className="mds-mono">{email}</code>
              </p>
            ) : null}
            {tedrisUrl ? (
              <Button href={tedrisUrl} variant="secondary">
                {t("back")}
              </Button>
            ) : null}
          </div>
        }
      >
        {t("body")}
      </SystemState>
    </>
  );
}
