"use client";

import type {
  CourseDetailResponse,
  RecordingResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Button } from "@medaris/ui/mds/button";
import { Card } from "@medaris/ui/mds/card";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { zoneName } from "@medaris/ui/mds/locale";
import { Tabs, TabsPanel } from "@medaris/ui/mds/tabs";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { courseCover } from "~/features/courses/course-cover";
import {
  courseTotals,
  courseViewState,
  holdsSeat,
  sessionWhen,
} from "../course-view";
import { canWriteNotes } from "../lesson-note-model";
import { firstSessionAt, formatFirstSession, isPreview } from "../preview";
import { sessionChoices } from "../question-model";
import { CourseAside } from "./course-aside";
import { CourseProgramme, SAMPLE_ANCHOR } from "./course-programme";
import { CourseQuestions } from "./course-questions";
import { RecordingsTab } from "./recordings-tab";

const joinNames = (names: string[], locale: string) =>
  new Intl.ListFormat(locale, { type: "conjunction" }).formatToParts(names);

/**
 * The course page in its five states (designs tedris/05, 06, 08, 12, 13): the
 * programme is open to everyone, the content is whatever the API lets this
 * caller read (`contentLocked`), and the card on the right follows the
 * caller's enrollment. A draft is the preview of tedris/14.
 */
export const CoursePage = ({
  course,
  koskName,
  approvalRequired = course.requiresApproval,
  signedIn = true,
  nazarUrl = null,
  signInHref = `/auth/signin?callbackUrl=${encodeURIComponent(`/courses/${course.id}`)}`,
  registerHref = "/auth/register",
  recordings = [],
  initialTab,
  now: nowProp,
}: {
  course: CourseDetailResponse;
  koskName?: string | null;
  /**
   * Whether joining waits for approval: the course's own setting, or always
   * in an unlisted köşk (MDRS-122). The API decides; this only picks the label.
   */
  approvalRequired?: boolean;
  /** False for a signed-out visitor (MDRS-122): the card asks them to sign in. */
  signedIn?: boolean;
  /**
   * Where "Düzenlemeye dön" goes (design tedris/14), the Nazar app's address;
   * null leaves the button out. Read from the server's environment.
   */
  nazarUrl?: string | null;
  signInHref?: string;
  registerHref?: string;
  /**
   * The recordings this caller may see (`GET /courses/:id/recordings`, MDRS-162):
   * the API has already left out what they may not. Null when the read
   * failed: the tab then offers a retry instead of the empty state.
   */
  recordings?: RecordingResponse[] | null;
  /** The tab the page opens on: `?tab=kayitlar` from a session page. */
  initialTab?: string;
  /** The instant the page is drawn at, for tests. */
  now?: number;
}) => {
  const t = useTranslations("tedris.CoursePage");
  const locale = useLocale();
  const [now] = useState(() => nowProp ?? Date.now());
  // Design tedris/14: a draft is shown to those who may edit it, as a preview.
  const preview = isPreview(course);
  const state = courseViewState(course, signedIn);
  const seat = holdsSeat(state);
  const totals = courseTotals(course);
  const zone = course.timeZone;

  const sample = course.weeks
    .flatMap((week) =>
      week.lessons.map((lesson) => ({ week: week.weekNumber, lesson }))
    )
    .find(({ lesson }) => lesson.isPreview);
  const showSample = !seat && !preview && sample;

  const firstSession = preview ? firstSessionAt(course) : null;

  // A question is asked by an enrolled talebe (MDRS-150); the tab is theirs.
  const asksQuestions =
    !course.contentLocked && canWriteNotes(course.enrollment?.status);

  const tabs = [
    { value: "mufredat", label: t("tabCurriculum") },
    {
      value: "kayitlar",
      label: t("tabRecordings"),
      ...(recordings && recordings.length > 0
        ? { count: recordings.length }
        : {}),
    },
    ...(seat ? [{ value: "deste", label: t("tabDeck") }] : []),
    ...(asksQuestions
      ? [{ value: "sorularim", label: t("tabMyQuestions") }]
      : []),
    { value: "muderrisler", label: t("tabTeachers") },
  ];

  const [tab, setTab] = useState(
    tabs.some((candidate) => candidate.value === initialTab)
      ? (initialTab as string)
      : "mufredat"
  );
  // MDRS-280: the recordings tab gives its video the page's whole width. From
  // md up its panel spans both columns, so the aside card stays beside the
  // header and does not stick beside the tabs there; every other tab keeps the
  // reading column and the sticky card.
  const wide = tab === "kayitlar";
  const asidePlace = wide
    ? "md:col-start-2 md:row-start-1"
    : "sticky inset-bs-[calc(var(--layout-topbar)+var(--space-6))] md:col-start-2 md:row-start-1 md:row-span-2 max-md:static";
  // The tab row starts under the taller of the header and the aside card on
  // the recordings tab, and under the header on the others, so a switch can
  // move it. It is held where the reader clicked it: the page scrolls by what
  // the row moved, as the browser's own scroll anchoring would.
  const tabRow = useRef<HTMLDivElement>(null);
  const pending = useRef<{ tab: string; top: number } | null>(null);
  const changeTab = (next: string) => {
    const top = tabRow.current?.getBoundingClientRect().top;
    pending.current = top === undefined ? null : { tab: next, top };
    setTab(next);
  };
  useLayoutEffect(() => {
    const before = pending.current;
    if (!before || before.tab !== tab || !tabRow.current) return;
    pending.current = null;
    const moved = tabRow.current.getBoundingClientRect().top - before.top;
    if (moved !== 0) window.scrollBy(0, moved);
  }, [tab]);

  const typeLabel = (type: string) =>
    ({
      LIVE: t("typeLive"),
      VIDEO: t("typeVideo"),
      DOCUMENT: t("typeDocument"),
      QUIZ: t("typeQuiz"),
    })[type] ?? type;

  const meta = [
    course.madrasah ? (
      <Link key="madrasah" href={`/madrasahs/${course.madrasah.id}`}>
        <bdi>{course.madrasah.name}</bdi>
      </Link>
    ) : null,
    koskName ? (
      <Link key="kosk" href={`/kosks/${course.koskId}`}>
        <bdi>{koskName}</bdi>
      </Link>
    ) : null,
    <span key="weeks">{t("weeksCount", { count: totals.weeks })}</span>,
    <span key="sessions">
      {t("sessionsCount", { count: totals.sessions })}
    </span>,
    totals.hours > 0 ? (
      <span key="hours">{t("hoursCount", { count: totals.hours })}</span>
    ) : null,
  ].filter((part) => part !== null);

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      {preview && (
        <Alert tone="neutral" title={t("previewBannerTitle")}>
          {t("previewBannerText")}
        </Alert>
      )}

      <Breadcrumb
        items={[
          ...(koskName
            ? [{ label: koskName, href: `/kosks/${course.koskId}` }]
            : []),
          { label: course.title },
        ]}
      />

      {/* Three grid items, not two columns: on a phone the course's cards come
          between its header and its tabs (design tedris/05, telefon). */}
      <div className="grid items-start gap-x-8 gap-y-section grid-cols-[minmax(0,1fr)_var(--layout-aside)] max-md:grid-cols-1">
        <div className="flex items-start gap-6 max-md:flex-col md:col-start-1 md:row-start-1">
          <div className="shrink-0 inline-[165px] max-md:inline-[7.5rem]">
            <CoverPattern {...courseCover(course)} size="lg" />
          </div>
          <div className="flex min-inline-0 flex-col gap-3">
            {preview && (
              <Badge variant="outline" className="self-start">
                {t("draftBadge")}
              </Badge>
            )}
            <h1 className="mds-h1" dir="auto">
              {course.title}
            </h1>
            {(course.description ?? course.subtitle) ? (
              <div className="mds-reading" dir="auto">
                {(course.description ?? course.subtitle ?? "")
                  .split(/\n{2,}/)
                  .filter(Boolean)
                  .map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
              </div>
            ) : null}
            <p className="mds-body-sm">
              {meta.map((part, i) => (
                <Fragment key={part.key}>
                  {part}
                  {i < meta.length - 1 ? (
                    <span className="mds-sep" aria-hidden="true">
                      ·
                    </span>
                  ) : null}
                </Fragment>
              ))}
            </p>
            {course.muderris.length === 1 ? (
              // Design tedris/12: one müderris is named with their initials and title.
              <div className="flex flex-wrap items-center gap-2">
                <Avatar name={course.muderris[0].name} size="sm" decorative />
                <span className="mds-body-sm">
                  {t("teacher")} <bdi>{course.muderris[0].name}</bdi>
                </span>
                {course.muderris[0].title ? (
                  <Badge variant="secondary">{course.muderris[0].title}</Badge>
                ) : null}
              </div>
            ) : course.muderris.length > 1 ? (
              <p className="mds-body-sm">
                {t("teachers")}:{" "}
                {joinNames(
                  course.muderris.map((m) => m.name),
                  locale
                ).map((part, i) => {
                  if (part.type === "literal")
                    return <Fragment key={`l${i}`}>{part.value}</Fragment>;
                  const m = course.muderris.find((x) => x.name === part.value);
                  return (
                    <Fragment key={m?.id ?? part.value}>
                      <bdi>{part.value}</bdi>
                      {m?.title ? (
                        <>
                          {" "}
                          <Badge variant="secondary">{m.title}</Badge>
                        </>
                      ) : null}
                    </Fragment>
                  );
                })}
              </p>
            ) : null}
          </div>
        </div>
        {preview ? (
          <aside className={asidePlace}>
            <Card
              title={t("previewCardTitle")}
              headingLevel={2}
              action={<Badge variant="outline">{t("previewCardBadge")}</Badge>}
            >
              <p className="mds-body-sm mbs-3">{t("previewCardText")}</p>
              {firstSession && (
                <div className="mbs-3">
                  <p className="mds-eyebrow">{t("firstSession")}</p>
                  <p className="mds-body-sm mds-num">
                    <time dateTime={firstSession.toISOString()}>
                      {formatFirstSession(firstSession, locale, zone)}
                    </time>
                  </p>
                </div>
              )}
              {nazarUrl && (
                <Button
                  href={nazarUrl}
                  variant="secondary"
                  fullWidth
                  className="mbs-4"
                  aria-label={t("backToEditingLabel", { title: course.title })}
                >
                  {t("backToEditing")}
                </Button>
              )}
            </Card>
          </aside>
        ) : (
          <div className={asidePlace}>
            <CourseAside
              course={course}
              state={state}
              now={now}
              approvalRequired={approvalRequired}
              signInHref={signInHref}
              registerHref={registerHref}
            />
          </div>
        )}
        <div
          ref={tabRow}
          className={`flex min-inline-0 flex-col gap-section md:col-start-1 md:row-start-2 ${wide ? "md:col-span-2" : ""}`}
        >
          <Tabs
            tabs={tabs}
            value={tab}
            onChange={changeTab}
            label={t("tabsLabel")}
          >
            <TabsPanel value="mufredat" className="flex flex-col gap-3 pbs-4">
              <p className="mds-caption">
                {t("programmeSummary", {
                  weeks: totals.weeks,
                  sessions: totals.sessions,
                  city: zoneName(zone),
                })}
              </p>
              <CourseProgramme course={course} state={state} now={now} />
            </TabsPanel>
            <TabsPanel value="kayitlar" className="pbs-4">
              <RecordingsTab
                recordings={recordings}
                timeZone={zone}
                notes={
                  !course.contentLocked &&
                  canWriteNotes(course.enrollment?.status)
                }
              />
            </TabsPanel>
            {seat ? (
              <TabsPanel value="deste" className="pbs-4">
                <EmptyState>{t("deckEmpty")}</EmptyState>
              </TabsPanel>
            ) : null}
            {asksQuestions ? (
              <TabsPanel value="sorularim" className="pbs-4">
                <CourseQuestions
                  courseId={course.id}
                  sessions={sessionChoices(course)}
                  timeZone={zone}
                  canAsk
                />
              </TabsPanel>
            ) : null}
            <TabsPanel
              value="muderrisler"
              className="grid gap-grid pbs-4 grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))]"
            >
              {course.muderris.map((m) => (
                <Card key={m.id} density="compact">
                  <div className="flex items-start gap-3">
                    <Avatar name={m.name} decorative />
                    <div className="flex min-inline-0 flex-col gap-1">
                      <p className="mds-body">
                        <bdi>{m.name}</bdi>
                      </p>
                      {m.title ? (
                        <p className="mds-caption" dir="auto">
                          {m.title}
                        </p>
                      ) : null}
                      {m.bio ? (
                        <p className="mds-body-sm" dir="auto">
                          {m.bio}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </Card>
              ))}
            </TabsPanel>
          </Tabs>

          {showSample ? (
            <section
              id={SAMPLE_ANCHOR}
              aria-labelledby="sample-heading"
              className="flex flex-col gap-3"
            >
              <h2 className="mds-h2" id="sample-heading">
                {t("sampleHeading")}
              </h2>
              <p className="mds-body-sm">{t("sampleIntro")}</p>
              <Card density="compact">
                <p className="mds-eyebrow">
                  {t("week", { number: sample.week })}
                </p>
                <h3 className="mds-h3" dir="auto">
                  {sample.lesson.title}
                </h3>
                {sample.lesson.scheduledAt ? (
                  <p className="mds-caption">
                    <time
                      dateTime={new Date(
                        sample.lesson.scheduledAt
                      ).toISOString()}
                    >
                      {sessionWhen(
                        new Date(sample.lesson.scheduledAt).getTime(),
                        locale,
                        zone
                      )}
                    </time>
                    <span className="mds-sep" aria-hidden="true">
                      ·
                    </span>
                    {typeLabel(sample.lesson.type)}
                    {sample.lesson.durationMinutes != null
                      ? ` · ${sample.lesson.durationMinutes} ${t("minuteUnit")}`
                      : ""}
                  </p>
                ) : null}
                <div className="mbs-4 grid gap-6 grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))]">
                  {sample.lesson.agenda && sample.lesson.agenda.length > 0 ? (
                    <div>
                      <h4 className="mds-h3">{t("agendaHeading")}</h4>
                      <ol className="m-0 flex list-none flex-col p-0 mbs-2">
                        {sample.lesson.agenda.map((step) => (
                          <li
                            key={`${step.time}-${step.title}`}
                            className="flex gap-3 py-2 [&:not(:last-child)]:border-b-[length:var(--border-width-thin)] [&:not(:last-child)]:border-[color:var(--border-neutral-subtle)]"
                          >
                            <time className="mds-caption mds-num">
                              {step.time}
                            </time>
                            <span className="mds-body-sm" dir="auto">
                              {step.title}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                  {sample.lesson.kaynak ? (
                    <div>
                      <h4 className="mds-h3">{t("sourceHeading")}</h4>
                      <p className="mds-body-sm mbs-2" dir="auto">
                        {sample.lesson.kaynak}
                      </p>
                    </div>
                  ) : null}
                </div>
              </Card>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
};
