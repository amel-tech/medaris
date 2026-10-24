import { Button } from "@medaris/ui/mds/button";
import { LocaleMenu } from "@medaris/ui/mds/locale-switcher";
import { appName, Logo } from "@medaris/ui/mds/logo";
import { SystemState } from "@medaris/ui/mds/system-state";
import { forbidden, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { landingFor } from "~/features/assignments/landing";
import { getMyAssignments } from "~/features/assignments/reads";
import { MedarisHome } from "~/features/dashboard/components/medaris-home";
import { getMyGrants, getNizamDashboard } from "~/features/dashboard/reads";
import { LoadFailed } from "~/features/kosks/components/load-failed";
import { auth } from "~/lib/auth";
import { locales } from "~/lib/i18n/routing";
import { shellVariant } from "~/lib/shell-nav";

// Per caller: who they are decides where they land.
export const dynamic = "force-dynamic";

export default async function Page() {
  const t = await getTranslations("common");
  const locale = await getLocale();

  // `/` is open to every visitor; without a session the shell is not drawn
  // and the way in is the sign-in button. The shell's language menu is drawn
  // here too, so a visitor picks the language before Keycloak is reached.
  const session = await auth();
  if (!session?.user) {
    const a = await getTranslations("nizam.Auth");
    const s = await getTranslations("nizam.Shell");
    return (
      <>
        <div className="fixed end-4 top-4">
          <LocaleMenu
            locale={locale}
            locales={locales}
            label={s("languageMenu")}
          />
        </div>
        <SystemState
          logo={
            <Logo
              app="nizam"
              size="lg"
              wordmark
              arabic={false}
              subtitle={appName("nizam", locale)}
            />
          }
          title={t("welcome")}
          action={<Button href={`/auth/signin`}>{a("signIn")}</Button>}
        />
      </>
    );
  }

  const me = await getMyAssignments();
  if (me) {
    const landing = landingFor(me);
    // Someone whose roles are all the medrese's and the course's has no work in
    // Nizam (design nizam/04); someone with no role at all has none either
    // (design nizam/03). A failed read keeps the page they asked for.
    if (landing === "nazar") redirect(`/nazar-yonlendirme`);
    if (landing === "none") redirect(`/yetki-yok`);
  }

  const variant = shellVariant(me);

  // A köşk nazımı's home is their köşk's: the first they manage, the one the
  // menu follows until they pick another.
  if (variant === "kosk") {
    const first = me?.assignments.find((a) => a.role === "KOSK_NAZIM")?.scopeId;
    if (first) redirect(`/kosks/${first}/ana-sayfa`);
  }

  if (variant === "chief" || variant === "medaris") {
    const [dashboard, grants] = await Promise.all([
      getNizamDashboard(),
      variant === "medaris" ? getMyGrants() : Promise.resolve(null),
    ]);
    if (dashboard === "forbidden") forbidden();
    if (dashboard === null || dashboard === "not-found") {
      const d = await getTranslations("nizam.Dashboard");
      return (
        <div className="mx-auto w-full max-w-[80rem]">
          <LoadFailed
            title={d("loadFailedTitle")}
            message={d("loadFailed")}
            retry={d("retry")}
          />
        </div>
      );
    }
    return (
      <div className="mx-auto w-full max-w-[80rem]">
        <MedarisHome
          data={dashboard}
          grants={grants}
          nowIso={new Date().toISOString()}
        />
      </div>
    );
  }

  return <div>{t("welcome")}</div>;
}
