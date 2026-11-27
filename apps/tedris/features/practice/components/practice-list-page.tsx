import type { PracticeSetSummaryResponse } from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { getLocale, getTranslations } from "next-intl/server";
import type { LooseTranslator } from "~/lib/i18n/loose";
import {
  actionOf,
  courseAnchor,
  groupByCourse,
  percentText,
  solveHref,
} from "../practice-model";

// Narrow on purpose: the full translator type hits TS2589 (MDRS-176).
type Translate = LooseTranslator;

/**
 * "Çalışma Soruları" (MDRS-248, Faz 3): every published set of the talebe's
 * courses, by course, with its question count, the talebe's finished
 * attempts and their latest percentage; "Başla", "Devam et" or "Tekrar çöz".
 * `sets` null is a failed read, drawn as such rather than as an empty list.
 */
export async function PracticeListPage({
  sets,
}: {
  sets: PracticeSetSummaryResponse[] | null;
}) {
  const t: Translate = (await getTranslations("tedris.Practice")) as never;
  const locale = await getLocale();

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <div className="flex flex-col gap-3">
        <h1 className="mds-h1">{t("pageTitle")}</h1>
        <p className="mds-body">{t("intro")}</p>
      </div>

      {sets === null ? (
        <Alert tone="error" title={t("loadFailedTitle")}>
          <p>{t("loadFailed")}</p>
          <p className="mbs-3">
            <Button variant="outline" size="small" href="">
              {t("retry")}
            </Button>
          </p>
        </Alert>
      ) : sets.length === 0 ? (
        <EmptyState>
          <p>{t("empty")}</p>
        </EmptyState>
      ) : (
        groupByCourse(sets).map((group) => (
          <section
            key={group.courseId}
            id={courseAnchor(group.courseId)}
            className="flex flex-col gap-3"
            aria-labelledby={`${courseAnchor(group.courseId)}-title`}
          >
            <h2
              id={`${courseAnchor(group.courseId)}-title`}
              className="mds-h2"
              dir="auto"
            >
              {group.courseTitle}
            </h2>
            <ul className="flex flex-col gap-3">
              {group.sets.map((set) => (
                <li key={set.id}>
                  <SetCard set={set} t={t} locale={locale} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}

function SetCard({
  set,
  t,
  locale,
}: {
  set: PracticeSetSummaryResponse;
  t: Translate;
  locale: string;
}) {
  const action = actionOf(set);
  const facts = [
    t("questionCount", { count: set.questionCount }),
    t("attemptCount", { count: set.attemptCount }),
  ].join(" · ");
  return (
    <article
      className="mds-card flex flex-col gap-2"
      data-testid="practice-set"
      data-action={action}
    >
      <h3 className="mds-h3" dir="auto">
        {set.title}
      </h3>
      {set.instructions ? (
        <p className="mds-body-sm whitespace-pre-line" dir="auto">
          {set.instructions}
        </p>
      ) : null}
      <p className="mds-body-sm text-neutral-muted">{facts}</p>
      {set.lastPercent !== null ? (
        <p className="mds-body">
          {t("lastPercent", { percent: percentText(set.lastPercent, locale) })}
        </p>
      ) : null}
      <div>
        <Button
          variant={action === "again" ? "secondary" : "primary"}
          href={solveHref(set.id)}
          aria-label={t(`${action}Label`, { title: set.title })}
        >
          {t(action)}
        </Button>
      </div>
    </article>
  );
}
