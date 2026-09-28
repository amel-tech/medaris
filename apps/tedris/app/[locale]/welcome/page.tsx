import { Button } from "@medaris/ui/components/button";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { completeWelcome } from "~/features/welcome/actions";
import { auth } from "~/lib/auth_options";

const STEPS = ["kosk", "course", "decks"] as const;

/**
 * B1, the first-login screen (MDRS-101). A placeholder — title, a short list
 * of first steps and one button — until the launch screens are designed
 * (MDRS-127); see docs/migration/mdrs-101-registration-entry.md.
 */
export default async function WelcomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("tedris");
  const session = await auth();
  const name = session?.user?.name;

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6 py-12">
      <h1 className="text-3xl font-semibold text-brand-primary">
        {name
          ? t("WelcomePage.titleWithName", { name })
          : t("WelcomePage.title")}
      </h1>
      <p className="text-neutral-secondary">{t("WelcomePage.description")}</p>
      <ol className="flex flex-col gap-3">
        {STEPS.map((step, index) => (
          <li
            key={step}
            className="flex items-center gap-3 rounded-md border border-neutral-300 p-4"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-brand-primary text-sm font-medium text-brand-inverse">
              {index + 1}
            </span>
            <span>{t(`WelcomePage.steps.${step}`)}</span>
          </li>
        ))}
      </ol>
      <form action={completeWelcome.bind(null, locale)}>
        <Button type="submit" size="lg">
          {t("WelcomePage.start")}
        </Button>
      </form>
    </section>
  );
}
