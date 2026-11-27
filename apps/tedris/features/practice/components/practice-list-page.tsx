import type {
  PracticePoolResponse,
  PracticeSetSummaryResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { getLocale, getTranslations } from "next-intl/server";
import type { LooseTranslator } from "~/lib/i18n/loose";
import {
  actionOf,
  courseAnchor,
  groupByCourse,
  percentText,
  poolHref,
  randomDefault,
  solveHref,
} from "../practice-model";

// Narrow on purpose: the full translator type hits TS2589 (MDRS-176).
type Translate = LooseTranslator;

/**
 * "Çalışma Soruları" (MDRS-248, Faz 3): every published set of the talebe's
 * courses, by course, with its question count, the talebe's finished
 * attempts and their latest percentage; "Başla", "Devam et" or "Tekrar çöz".
 * `sets` null is a failed read, drawn as such rather than as an empty list.
 *
 * Under each course's heading, its question pool (Faz 4): "Tüm soruları
 * çöz", "Rastgele soru çöz" with how many, or "Karışık denemeye devam et"
 * while a pool attempt is open. A course whose pool could not be read, or
 * holds no question, shows none of them.
 */
export async function PracticeListPage({
  sets,
  pools = new Map(),
}: {
  sets: PracticeSetSummaryResponse[] | null;
  pools?: ReadonlyMap<string, PracticePoolResponse>;
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
            <PoolPanel pool={pools.get(group.courseId)} t={t} />
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

function PoolPanel({
  pool,
  t,
}: {
  pool: PracticePoolResponse | undefined;
  t: Translate;
}) {
  if (!pool || pool.questionCount === 0) return null;
  const inputId = `pool-count-${pool.courseId}`;
  return (
    <section
      className="mds-card flex flex-col gap-3"
      data-testid="practice-pool"
      aria-label={t("poolLabel")}
    >
      <p className="mds-body-sm text-neutral-muted">{t("poolIntro")}</p>
      {pool.openAttemptId ? (
        <div>
          <Button href={poolHref(pool.courseId)}>{t("poolContinue")}</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <Button href={poolHref(pool.courseId, "ALL")}>
            {t("poolAll", { count: pool.questionCount })}
          </Button>
          {/* A plain GET form: the pool page reads `mod` and `sayi` and starts the attempt itself. */}
          <form
            action={poolHref(pool.courseId)}
            method="get"
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="mod" value="RANDOM" />
            <Field label={t("poolCountLabel")}>
              <Input
                id={inputId}
                name="sayi"
                type="number"
                inputMode="numeric"
                min={1}
                max={pool.questionCount}
                step={1}
                required
                defaultValue={randomDefault(pool.questionCount)}
                size="small"
                className="inline-24"
              />
            </Field>
            <Button type="submit" variant="secondary">
              {t("poolRandom")}
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}
