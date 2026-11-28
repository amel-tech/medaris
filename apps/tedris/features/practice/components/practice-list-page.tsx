import type {
  PracticePoolResponse,
  PracticeSetSummaryResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Badge, type BadgeVariant } from "@medaris/ui/mds/badge";
import { Button, type ButtonVariant } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { getLocale, getTranslations } from "next-intl/server";
import { notesHref } from "~/features/question-notes/note-model";
import type { LooseTranslator } from "~/lib/i18n/loose";
import {
  actionOf,
  courseAnchor,
  groupByCourse,
  type PracticeAction,
  percentText,
  poolHref,
  randomDefault,
  solveHref,
} from "../practice-model";

// Narrow on purpose: the full translator type hits TS2589 (MDRS-176).
type Translate = LooseTranslator;

/**
 * A table element's own role, said out loud: below 768px the set table's
 * rows are `display: grid`/`block`, which drops the implicit roles in some
 * browsers (what `Table responsive="stack"` does with its `role()`).
 */
const role = (name: string) => ({ role: name });

/** A set's state, said in words beside its colour: new, in progress, solved. */
const STATUS: Record<PracticeAction, { key: string; badge: BadgeVariant }> = {
  start: { key: "statusNew", badge: "secondary" },
  continue: { key: "statusInProgress", badge: "warning" },
  again: { key: "statusSolved", badge: "success" },
};

/**
 * One filled button per row at most: "Devam et" is the thing to go back to,
 * "Başla" the next one to open, "Tekrar çöz" the quietest.
 */
const ACTION_VARIANT: Record<PracticeAction, ButtonVariant> = {
  continue: "primary",
  start: "secondary",
  again: "outline",
};

/**
 * "Çalışma Soruları" (MDRS-248, Faz 3): every published set of the talebe's
 * courses, by course, with its question count, the talebe's finished
 * attempts and their latest percentage; "Başla", "Devam et" or "Tekrar çöz".
 * `sets` null is a failed read, drawn as such rather than as an empty list.
 *
 * Each course is a heading with how many of its sets are solved, its sets as
 * one table (a card per row below 768px, the system's `mds-table--stack`),
 * so ten and more sets stay scannable; then its question pool (Faz 4):
 * "Tüm soruları çöz", "Rastgele soru çöz" with how many, or "Karışık
 * denemeye devam et" while a pool attempt is open. A course whose pool could
 * not be read, or holds no question, shows none of them.
 */
export async function PracticeListPage({
  sets,
  pools = new Map(),
}: {
  sets: PracticeSetSummaryResponse[] | null;
  pools?: ReadonlyMap<string, PracticePoolResponse>;
}) {
  const t: Translate = (await getTranslations("tedris.Practice")) as never;
  const tn: Translate = (await getTranslations(
    "tedris.QuestionNotes"
  )) as never;
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
        groupByCourse(sets).map((group) => {
          const anchor = courseAnchor(group.courseId);
          // The same rule as the rows' badges: a set being solved again is "Devam ediyor".
          const solved = group.sets.filter(
            (s) => actionOf(s) === "again"
          ).length;
          return (
            <section
              key={group.courseId}
              id={anchor}
              className="flex flex-col gap-4"
              // The course page's link lands here: clear of the sticky app bar.
              style={{
                scrollMarginBlockStart:
                  "calc(var(--layout-topbar, 64px) + var(--space-4))",
              }}
              aria-labelledby={`${anchor}-title`}
            >
              <div className="flex flex-col gap-1">
                <h2 id={`${anchor}-title`} className="mds-h2" dir="auto">
                  {group.courseTitle}
                </h2>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <p
                    className="mds-body-sm text-neutral-muted"
                    data-testid="practice-course-summary"
                  >
                    {t("courseSummary", {
                      sets: group.sets.length,
                      solved,
                    })}
                  </p>
                  {/* The course's question notes (soru notları). No count: the
                      API marks the answers read as it lists them, so only the
                      notes page itself reads them. */}
                  <Button
                    size="small"
                    variant="outline"
                    href={notesHref(group.courseId)}
                    iconLeft={<Icon name="note" size="sm" />}
                    aria-label={tn("notesLinkLabel", {
                      course: group.courseTitle,
                    })}
                    data-testid="practice-notes-link"
                  >
                    {tn("notesLink")}
                  </Button>
                </div>
              </div>
              <SetTable
                sets={group.sets}
                caption={t("tableCaption", { course: group.courseTitle })}
                t={t}
                locale={locale}
              />
              <PoolPanel pool={pools.get(group.courseId)} t={t} />
            </section>
          );
        })
      )}
    </main>
  );
}

/**
 * The course's sets as a table: set, questions, attempts, last result,
 * state and the one action, the columns the same width in every course.
 * Drawn with the system's class layer (`.mds-table`) rather than the
 * client-only `Table` component, so the server renders it and each row
 * keeps its `data-testid`. Below 768px a row is two lines, not a table: the
 * set and its state, then "N soru · N deneme · Son sonucun" and the action
 * (the three number cells stay in the accessibility tree, visually hidden,
 * and that line is for the eye only). The explicit roles keep it a table
 * for assistive technology once `display` changes.
 */
function SetTable({
  sets,
  caption,
  t,
  locale,
}: {
  sets: PracticeSetSummaryResponse[];
  caption: string;
  t: Translate;
  locale: string;
}) {
  const cell = "max-md:p-0! max-md:border-0!";
  // Off the phone's two lines but still read, under their own headers.
  const numberCell =
    "is-end mds-num max-md:sr-only max-md:p-0! max-md:border-0!";
  return (
    <div className="mds-table-wrap">
      <table
        className="mds-table md:table-fixed max-md:block!"
        {...role("table")}
      >
        <caption className="mds-table__caption mds-visually-hidden">
          {caption}
        </caption>
        <colgroup className="max-md:hidden">
          <col />
          <col className="inline-22" />
          <col className="inline-24" />
          <col className="inline-28" />
          <col className="inline-36" />
          <col className="inline-36" />
        </colgroup>
        <thead {...role("rowgroup")} className="max-md:sr-only">
          <tr {...role("row")}>
            <th scope="col" {...role("columnheader")}>
              {t("colSet")}
            </th>
            <th scope="col" {...role("columnheader")} className="is-end">
              {t("colQuestions")}
            </th>
            <th scope="col" {...role("columnheader")} className="is-end">
              {t("colAttempts")}
            </th>
            <th scope="col" {...role("columnheader")} className="is-end">
              {t("colLast")}
            </th>
            <th scope="col" {...role("columnheader")}>
              {t("colStatus")}
            </th>
            <th scope="col" {...role("columnheader")}>
              <span className="mds-visually-hidden">{t("colAction")}</span>
            </th>
          </tr>
        </thead>
        <tbody {...role("rowgroup")} className="max-md:block!">
          {sets.map((set) => {
            const action = actionOf(set);
            const status = STATUS[action];
            const last =
              set.lastPercent !== null
                ? percentText(set.lastPercent, locale)
                : null;
            return (
              <tr
                key={set.id}
                {...role("row")}
                data-testid="practice-set"
                data-action={action}
                className="max-md:grid! max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:gap-x-3 max-md:gap-y-2 max-md:px-4 max-md:py-3 max-md:border-b max-md:border-[var(--border-neutral-subtle)] max-md:last:border-b-0"
              >
                <th
                  scope="row"
                  {...role("rowheader")}
                  className={`${cell} max-md:col-start-1 max-md:row-start-1`}
                >
                  <span className="flex flex-col gap-1">
                    <span className="mds-table__cell--strong" dir="auto">
                      {set.title}
                    </span>
                    {set.instructions ? (
                      <span
                        className="mds-caption text-neutral-muted line-clamp-2 whitespace-pre-line"
                        dir="auto"
                      >
                        {set.instructions}
                      </span>
                    ) : null}
                  </span>
                </th>
                <td {...role("cell")} className={numberCell}>
                  {set.questionCount}
                </td>
                <td {...role("cell")} className={numberCell}>
                  {set.attemptCount}
                </td>
                <td
                  {...role("cell")}
                  className={numberCell}
                  data-testid="practice-set-last"
                >
                  {last !== null ? (
                    <strong>{last}</strong>
                  ) : (
                    <span className="text-neutral-muted">
                      <span aria-hidden="true">—</span>
                      <span className="mds-visually-hidden">
                        {t("noResultYet")}
                      </span>
                    </span>
                  )}
                </td>
                <td
                  {...role("cell")}
                  className={`${cell} max-md:col-start-2 max-md:row-start-1 max-md:justify-self-end`}
                >
                  <Badge
                    variant={status.badge}
                    className="min-inline-24 justify-center"
                  >
                    {t(status.key)}
                  </Badge>
                </td>
                <td
                  {...role("cell")}
                  className={`is-end ${cell} max-md:col-start-2 max-md:row-start-2 max-md:justify-self-end`}
                >
                  <Button
                    size="small"
                    variant={ACTION_VARIANT[action]}
                    className="min-inline-24 justify-center"
                    href={solveHref(set.id)}
                    aria-label={t(`${action}Label`, { title: set.title })}
                  >
                    {t(action)}
                  </Button>
                </td>
                {/* The phone's one line in place of the three number cells. */}
                <td
                  {...role("cell")}
                  className={`hidden! max-md:block! ${cell} max-md:col-start-1 max-md:row-start-2 mds-body-sm text-neutral-muted`}
                  data-testid="practice-set-facts"
                  aria-hidden="true"
                >
                  {[
                    t("questionCount", { count: set.questionCount }),
                    t("attemptCount", { count: set.attemptCount }),
                    ...(last !== null
                      ? [t("lastPercent", { percent: last })]
                      : []),
                  ].join(" · ")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
  const titleId = `pool-title-${pool.courseId}`;
  return (
    <section
      className="mds-card flex flex-col gap-3"
      data-testid="practice-pool"
      aria-labelledby={titleId}
    >
      <div className="flex flex-col gap-1">
        <h3 id={titleId} className="mds-h4">
          {t("poolTitle")}
        </h3>
        <p className="mds-body-sm text-neutral-muted">{t("poolIntro")}</p>
      </div>
      {pool.openAttemptId ? (
        <div>
          <Button href={poolHref(pool.courseId)}>{t("poolContinue")}</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <Button variant="secondary" href={poolHref(pool.courseId, "ALL")}>
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
            <Button type="submit" variant="outline">
              {t("poolRandom")}
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}
