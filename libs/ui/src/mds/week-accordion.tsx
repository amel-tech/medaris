"use client";

import { Accordion } from "@base-ui/react/accordion";
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { cx } from "./cx";
import { formatNumber, joinRun, usePageLocale } from "./locale";

// A date-only value ("2026-10-17") is that calendar day wherever the viewer is.
function openDate(iso: string, locale: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    ...(dateOnly && { timeZone: "UTC" }),
  }).format(at);
}

export interface WeekAccordionProps {
  week: number;
  title: ReactNode;
  state?: "default" | "active" | "done";
  /** `locked` locks the lessons' bodies and links, never the programme */
  access?: "open" | "locked";
  /** ISO date the week opens; the week still opens in the UI */
  opensOn?: string;
  summary?: ReactNode;
  meta?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  /** `role="region"`, only for a course of six weeks or fewer */
  region?: boolean;
  weekLabel?: string;
  activeLabel?: string;
  doneLabel?: string;
  lockedLabel?: string;
  opensOnLabel?: string;
  emptyLabel?: string;
  locale?: string;
  /** `LessonRow`s only; the week wraps them in the `ol` */
  children?: ReactNode;
  className?: string;
}

/**
 * One week of a programme: a heading holding the button that opens its
 * lessons. Base UI Accordion item; render inside `Weeks`.
 */
export function WeekAccordion({
  week,
  title,
  state = "default",
  access = "open",
  opensOn,
  summary,
  meta,
  headingLevel = 3,
  region = false,
  weekLabel = "Hafta {week}",
  activeLabel = "Devam ediyor",
  doneLabel = "Tamamlandı",
  lockedLabel = ", kilitli",
  opensOnLabel = "{date} tarihinde açılır",
  emptyLabel = "Bu hafta için henüz celse eklenmedi.",
  locale: localeProp,
  children,
  className,
}: WeekAccordionProps) {
  const { ref, lang: locale } = usePageLocale<HTMLDivElement>(localeProp);
  const locked = access === "locked";
  // locked wins: a viewer who may not open the lessons has no progress in them
  const shown = locked ? "locked" : state;
  const level = [2, 3, 4].includes(headingLevel) ? headingLevel : 3;
  const n = formatNumber(week, locale);

  const metaItems: ReactNode[] = [];
  if (opensOn) {
    const [before, after = ""] = opensOnLabel.split("{date}");
    metaItems.push(
      <span key="opens">
        {before}
        <time dateTime={opensOn}>{openDate(opensOn, locale)}</time>
        {after}
      </span>
    );
  }
  if (meta) metaItems.push(<span key="meta">{meta}</span>);
  const rows = Children.toArray(children);

  return (
    <Accordion.Item
      ref={ref}
      value={String(week)}
      className={cx(
        "mds-week",
        shown !== "default" && `is-${shown}`,
        className
      )}
    >
      <Accordion.Header
        className="mds-week__heading"
        render={(props) => {
          const H = `h${level}` as "h3";
          return <H {...props} />;
        }}
      >
        <Accordion.Trigger className="mds-week__trigger">
          <span className="mds-week__medallion" aria-hidden="true">
            {shown === "done" || shown === "locked" ? null : n}
          </span>
          <span className="mds-week__titles">
            <span className="mds-week__eyebrow">
              <span className="mds-eyebrow">
                {weekLabel.replace("{week}", n)}
              </span>
              {shown === "active" ? (
                <span className="mds-badge mds-badge--brand">
                  {activeLabel}
                </span>
              ) : null}
              {shown === "done" ? (
                <span className="mds-badge mds-badge--success">
                  {doneLabel}
                </span>
              ) : null}
            </span>
            <span className="mds-week__title" dir="auto">
              {title}
            </span>
            {locked ? (
              <span className="mds-visually-hidden">{lockedLabel}</span>
            ) : null}
          </span>
          {metaItems.length > 0 ? (
            <span className="mds-week__meta">{joinRun(metaItems)}</span>
          ) : null}
          <span className="mds-week__chevron" aria-hidden="true" />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Panel
        className="mds-week__panel"
        role={region ? "region" : undefined}
      >
        {summary ? (
          <p className="mds-week__summary" dir="auto">
            {summary}
          </p>
        ) : null}
        {rows.length ? (
          <ol className="mds-lesson-list">{rows}</ol>
        ) : (
          <p className="mds-week__empty">{emptyLabel}</p>
        )}
      </Accordion.Panel>
    </Accordion.Item>
  );
}

export interface WeeksProps {
  /** `WeekAccordion` children */
  children: ReactNode;
  /** the weeks open at first (week numbers); the active week when omitted */
  defaultOpen?: number[];
  className?: string;
}

/**
 * The `div.mds-weeks` that stacks weeks 8px apart: a Base UI Accordion root
 * with `multiple` (several weeks may be open) and `hiddenUntilFound` (the
 * browser's find-in-page opens a collapsed week).
 */
export function Weeks({ children, defaultOpen, className }: WeeksProps) {
  const fromState = Children.toArray(children)
    .filter(
      (c): c is ReactElement<WeekAccordionProps> =>
        isValidElement<WeekAccordionProps>(c) &&
        c.props.state === "active" &&
        c.props.access !== "locked"
    )
    .map((c) => String(c.props.week));
  const initial = defaultOpen ? defaultOpen.map(String) : fromState;
  return (
    <Accordion.Root
      key={initial.join(",")}
      multiple
      hiddenUntilFound
      defaultValue={initial}
      className={cx("mds-weeks", className)}
    >
      {children}
    </Accordion.Root>
  );
}
