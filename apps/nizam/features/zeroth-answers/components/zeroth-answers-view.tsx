"use client";

import type {
  ZerothAnswerCountsResponse,
  ZerothQuestionExamsResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { Select } from "@medaris/ui/mds/select";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useState } from "react";
import {
  percentOf,
  placeOptions,
  spanReversed,
  type ZerothFilters,
  zerothFiltersToQuery,
} from "../present";

/** The hadith the zeroth question is about, as the talebe sees it. */
export const ZEROTH_HADITH = "مَنْ غَشَّنَا فَلَيْسَ مِنَّا";

const ALL = "ALL";

type Exam = ZerothQuestionExamsResponse["exams"][number];

interface Props {
  /** a köşk nazımı's page holds their köşk and no other (ui rule kosk-nazim-scope) */
  kosk: { id: string; name: string } | null;
  filters: ZerothFilters;
  /** null when the read failed */
  list: ZerothAnswerCountsResponse | null;
  /** one question's exams when `filters.question` names one; "gone" when no exam of the span asks it any more; null when not asked or the read failed */
  detail: ZerothQuestionExamsResponse | "gone" | null;
}

/**
 * Sıfırıncı soru cevapları (MDRS-299, nizam.exams.zerothAnswers): how the
 * zeroth question of the online exams was answered, in aggregate. No name and
 * no single answer is ever on the page; every count is shown as it is. The
 * filters live in the address: "Uygula" moves to it, and the server page reads
 * again.
 */
export function ZerothAnswersView({ kosk, filters, list, detail }: Props) {
  const t = useTranslations("nizam.ZerothAnswersPage");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const router = useRouter();
  const pathname = usePathname();

  const [draft, setDraft] = useState(filters);
  const [checked, setChecked] = useState(false);
  const reversed = checked && spanReversed(draft);
  const places = placeOptions(list?.courses ?? [], {
    kosk: kosk?.id ?? draft.kosk,
    madrasah: draft.madrasah,
  });
  const go = (next: Partial<ZerothFilters>) => {
    const query = zerothFiltersToQuery({
      ...next,
      kosk: kosk ? undefined : next.kosk,
    });
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  /** "238 talebe cevapladı". */
  const answeredLine = (answered: number) => t("answeredCount", { answered });

  /** "Bu derste: 97 talebe (%41)", or the count alone when nobody answered. */
  const optionLine = (option: string, count: number, total: number) => {
    const percent = percentOf(count, total);
    return percent === null
      ? t("optionCountOnly", { option, count })
      : t("optionCount", { option, count, percent });
  };

  const date = (at: Date | string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone,
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(typeof at === "string" ? new Date(at) : at);

  const open = detail && detail !== "gone" ? detail : null;
  // The list was read but the question the address opens was not.
  const detailFailed = Boolean(filters.question) && detail === null;
  const back = () => go({ ...filters, question: undefined });

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="zeroth-answers"
    >
      <header className="flex flex-col gap-3">
        <h1 className="mds-h1">{t("title")}</h1>
        {open || detailFailed ? null : (
          <p className="max-w-[48rem]">{t("intro")}</p>
        )}
        <figure className="flex flex-col gap-1">
          <p className="mds-arabic-text" lang="ar" dir="rtl">
            {ZEROTH_HADITH}
          </p>
          <figcaption className="mds-caption">{t("hadithMeaning")}</figcaption>
        </figure>
      </header>

      {open || detailFailed ? null : (
        <search aria-label={t("filtersLabel")}>
          <form
            className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              setChecked(true);
              if (spanReversed(draft)) return;
              go({ ...draft, question: undefined });
            }}
          >
            <fieldset className="flex flex-wrap gap-4 md:col-span-2 lg:col-span-3">
              <legend className="mds-label">{t("dateSpan")}</legend>
              <Field label={t("from")}>
                <Input
                  name="from"
                  type="date"
                  value={draft.from}
                  onChange={(e) =>
                    setDraft({ ...draft, from: e.target.value || filters.from })
                  }
                />
              </Field>
              <Field
                label={t("to")}
                error={reversed ? t("spanReversed") : undefined}
              >
                <Input
                  name="to"
                  type="date"
                  value={draft.to}
                  onChange={(e) =>
                    setDraft({ ...draft, to: e.target.value || filters.to })
                  }
                />
              </Field>
            </fieldset>
            <Field label={t("kosk")}>
              {kosk ? (
                <Select
                  name="kosk"
                  options={[{ value: kosk.id, label: kosk.name }]}
                  value={kosk.id}
                  disabled
                />
              ) : (
                <Select
                  name="kosk"
                  options={[
                    { value: ALL, label: t("allKosks") },
                    ...places.kosks,
                  ]}
                  value={draft.kosk ?? ALL}
                  onChange={(v) =>
                    setDraft({
                      ...draft,
                      kosk: v && v !== ALL ? v : undefined,
                      madrasah: undefined,
                      course: undefined,
                    })
                  }
                />
              )}
            </Field>
            <Field label={t("madrasah")}>
              <Select
                name="madrasah"
                options={[
                  { value: ALL, label: t("allMadrasahs") },
                  ...places.madrasahs,
                ]}
                value={draft.madrasah ?? ALL}
                onChange={(v) =>
                  setDraft({
                    ...draft,
                    madrasah: v && v !== ALL ? v : undefined,
                    course: undefined,
                  })
                }
              />
            </Field>
            <Field label={t("course")}>
              <Select
                name="course"
                options={[
                  { value: ALL, label: t("allCourses") },
                  ...places.courses,
                ]}
                value={draft.course ?? ALL}
                onChange={(v) =>
                  setDraft({ ...draft, course: v && v !== ALL ? v : undefined })
                }
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit">{t("applyFilters")}</Button>
            </div>
          </form>
        </search>
      )}

      {list === null ? (
        <Alert tone="error" title={t("loadFailedTitle")}>
          <p>{t("loadFailed")}</p>
          <Button
            variant="outline"
            size="small"
            onClick={() => router.refresh()}
          >
            {t("retry")}
          </Button>
        </Alert>
      ) : detailFailed ? (
        <Alert tone="error" title={t("detailFailedTitle")}>
          <p>{t("loadFailed")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="small"
              onClick={() => router.refresh()}
            >
              {t("retry")}
            </Button>
            <Button variant="ghost" size="small" onClick={back}>
              {t("backToQuestions")}
            </Button>
          </div>
        </Alert>
      ) : open ? (
        <QuestionDetail
          detail={open}
          answeredLine={answeredLine}
          optionLine={optionLine}
          date={date}
          onBack={back}
        />
      ) : (
        <>
          {detail === "gone" ? (
            <output className="mds-caption block">{t("questionGone")}</output>
          ) : null}
          {list.questions.length === 0 ? (
            <p>{t("noAnswers")}</p>
          ) : (
            <section
              className="flex flex-col gap-4"
              aria-labelledby="zeroth-questions-title"
            >
              <h2 id="zeroth-questions-title" className="mds-h2">
                {t("questionsTitle", { count: list.questions.length })}
              </h2>
              <ul className="flex flex-col gap-4">
                {list.questions.map((q) => (
                  <li key={q.questionKey}>
                    <section
                      className="mds-card flex flex-col gap-2 p-card"
                      aria-labelledby={`zeroth-${q.questionKey}`}
                    >
                      <h3
                        id={`zeroth-${q.questionKey}`}
                        className="mds-h3"
                        dir="auto"
                      >
                        {q.question}
                      </h3>
                      <p className="mds-body-sm">
                        {t("askedInExams", { exams: q.exams })} ·{" "}
                        {answeredLine(q.answered)}
                      </p>
                      <ul
                        className="mds-body-sm flex flex-col gap-1"
                        aria-label={t("optionCountsLabel")}
                      >
                        {q.options.map((o, j) => (
                          <li key={`${j}-${o.text}`} dir="auto">
                            {optionLine(o.text, o.count, q.answered)}
                          </li>
                        ))}
                      </ul>
                      <div>
                        <Button
                          variant="secondary"
                          size="small"
                          aria-label={t("openExamsLabel", {
                            question: q.question,
                          })}
                          onClick={() =>
                            go({ ...filters, question: q.questionKey })
                          }
                        >
                          {t("openExams")}
                        </Button>
                      </div>
                    </section>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function QuestionDetail({
  detail,
  answeredLine,
  optionLine,
  date,
  onBack,
}: {
  detail: ZerothQuestionExamsResponse;
  answeredLine: (answered: number) => string;
  optionLine: (option: string, count: number, total: number) => string;
  date: (at: Date | string) => string;
  onBack: () => void;
}) {
  const t = useTranslations("nizam.ZerothAnswersPage");
  const columns: TableColumn<Exam>[] = [
    {
      key: "course",
      header: t("course"),
      rowHeader: true,
      render: (e) => <bdi>{e.courseTitle}</bdi>,
    },
    { key: "kosk", header: t("kosk"), render: (e) => <bdi>{e.koskName}</bdi> },
    { key: "date", header: t("colDate"), render: (e) => date(e.startsAt) },
    {
      key: "answered",
      header: t("colAnswered"),
      align: "right",
      render: (e) => String(e.answered),
    },
    {
      key: "options",
      header: t("colOptions"),
      render: (e) => (
        <ul className="flex flex-col gap-1">
          {detail.options.map((o, j) => (
            <li key={`${j}-${o.text}`} dir="auto">
              {optionLine(o.text, e.options[j] ?? 0, e.answered)}
            </li>
          ))}
        </ul>
      ),
    },
  ];
  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="zeroth-detail-title"
    >
      <h2 id="zeroth-detail-title" className="mds-h2" dir="auto">
        {detail.question}
      </h2>
      <p>{answeredLine(detail.answered)}</p>
      <ul className="flex flex-col gap-1" aria-label={t("optionCountsLabel")}>
        {detail.options.map((o, j) => (
          <li key={`${j}-${o.text}`} dir="auto">
            {optionLine(o.text, o.count, detail.answered)}
          </li>
        ))}
      </ul>
      <Table
        caption={t("examsTableLabel")}
        columns={columns}
        rows={detail.exams}
        rowKey={(e) => e.examId}
      />
      <div>
        <Button variant="secondary" onClick={onBack}>
          {t("backToQuestions")}
        </Button>
      </div>
    </section>
  );
}
