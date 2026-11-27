import type { PracticeAttemptResponse } from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import Link from "next/link";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import type { LooseTranslator } from "~/lib/i18n/loose";
import { continueHref, PRACTICE_HREF } from "../practice-model";
import type { PracticeAttemptRead } from "../reads";
import { PracticeResultBody } from "./practice-result-body";

// Narrow on purpose: the full translator type hits TS2589 (MDRS-176).
type Translate = LooseTranslator;

/**
 * A finished çalışma attempt (MDRS-248, Faz 3): the percentage, the correct,
 * wrong and blank counts, and every question with the talebe's choice and
 * the correct options, in the colours of a past exam's screen; "Tekrar çöz"
 * and "Çalışma sorularına dön" (`PracticeResultBody`, which also filters the
 * questions). An attempt still in progress leads back to it.
 */
export async function PracticeResult({ read }: { read: PracticeAttemptRead }) {
  const t: Translate = (await getTranslations("tedris.Practice")) as never;
  const locale = await getLocale();
  const timeZone = await getTimeZone();
  const when = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <nav aria-label={t("breadcrumbLabel")} className="mds-caption">
        <Link className="mds-btn mds-btn--link" href={PRACTICE_HREF}>
          {t("pageTitle")}
        </Link>
      </nav>
      {read.status === "ok" ? (
        <Result
          attempt={read.attempt}
          t={t}
          at={(value) => when.format(new Date(value))}
        />
      ) : (
        <Alert
          tone={read.status === "absent" ? "neutral" : "error"}
          title={t(
            read.status === "absent"
              ? "resultNotFoundTitle"
              : "resultFailedTitle"
          )}
        >
          <p>
            {t(read.status === "absent" ? "resultNotFound" : "resultFailed")}
          </p>
          <p className="mbs-3">
            {read.status === "failed" ? (
              <Button variant="outline" size="small" href="">
                {t("retry")}
              </Button>
            ) : (
              <Button variant="secondary" size="small" href={PRACTICE_HREF}>
                {t("backToList")}
              </Button>
            )}
          </p>
        </Alert>
      )}
    </main>
  );
}

function Result({
  attempt,
  t,
  at,
}: {
  attempt: PracticeAttemptResponse;
  t: Translate;
  at: (value: Date | string) => string;
}) {
  const heading = (
    <h1 className="mds-h1" dir="auto">
      {attempt.setId ? attempt.title : t("poolTitle")}
    </h1>
  );

  if (attempt.status !== "FINISHED" || !attempt.result) {
    return (
      <>
        {heading}
        <Alert tone="neutral" title={t("inProgressTitle")}>
          <p>{t("inProgress")}</p>
          <p className="mbs-3">
            <Button size="small" href={continueHref(attempt)}>
              {t("continue")}
            </Button>
          </p>
        </Alert>
      </>
    );
  }

  return (
    <>
      {heading}
      <PracticeResultBody
        attempt={attempt}
        finishedAtText={attempt.finishedAt ? at(attempt.finishedAt) : null}
      />
    </>
  );
}
