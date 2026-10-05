"use client";

import { useDirection } from "@base-ui/react/direction-provider";
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addDays,
  addMonths,
  addYears,
  clampIsoDate,
  endOfWeek,
  firstDayOfWeek,
  isIsoDate,
  isWithin,
  monthGrid,
  monthHasDayWithin,
  parseIsoDate,
  startOfWeek,
  todayIso,
} from "../lib/date-parts";
import { cx } from "./cx";
import { Icon } from "./icon";
import { formatNumber, usePageLocale } from "./locale";

export interface CalendarLabels {
  /** the previous-month button's name */
  prevMonthLabel?: string;
  /** the next-month button's name */
  nextMonthLabel?: string;
  /** the button that picks today */
  todayLabel?: string;
}

export interface CalendarProps extends CalendarLabels {
  /** the chosen day, "YYYY-MM-DD", or "" for none */
  value?: string;
  /** a day was picked (click, Enter or Space, or the today button) */
  onSelect: (date: string) => void;
  /** the first day that can be picked, "YYYY-MM-DD" */
  min?: string;
  /** the last day that can be picked, "YYYY-MM-DD" */
  max?: string;
  /** a BCP 47 tag; the page's `lang` otherwise (MDS-NUM-01) */
  locale?: string;
  /** the reading direction; Base UI's `DirectionProvider` otherwise */
  dir?: "ltr" | "rtl";
  className?: string;
}

type Formatters = {
  title: Intl.DateTimeFormat;
  dayName: Intl.DateTimeFormat;
  weekdayShort: Intl.DateTimeFormat;
  weekdayLong: Intl.DateTimeFormat;
};

function formatters(lang: string): Formatters {
  const base = { timeZone: "UTC", calendar: "gregory" } as const;
  const make = (options: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat(lang, { ...base, ...options });
    } catch {
      return new Intl.DateTimeFormat("tr-TR", { ...base, ...options });
    }
  };
  return {
    title: make({ month: "long", year: "numeric" }),
    dayName: make({
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    weekdayShort: make({ weekday: "short" }),
    weekdayLong: make({ weekday: "long" }),
  };
}

/** A "YYYY-MM-DD" as a UTC instant, for the formatters above (all in UTC). */
function utc(iso: string): Date {
  const p = parseIsoDate(iso) ?? { year: 2000, month: 1, day: 1 };
  const d = new Date(0);
  d.setUTCFullYear(p.year, p.month - 1, p.day);
  return d;
}

/**
 * One month as a WAI-ARIA date grid (the date-picker dialog pattern): a
 * `role="grid"` table whose column headers are the weekdays, one day button
 * in the tab order (roving tabindex) and the keys the pattern names. Arrows
 * move a day or a week, and Left/Right follow the reading direction, so in
 * Arabic Left is the next day; Home/End go to the week's first and last day;
 * PageUp/PageDown move a month, with Shift a year; Enter and Space pick. Esc
 * belongs to the popover around it.
 *
 * The week starts on the locale's first day (`Intl.Locale#weekInfo`; Monday
 * for tr and when the runtime cannot say). Days outside `min`/`max` stay
 * reachable by keyboard so the grid has no holes, but are `aria-disabled`
 * and cannot be picked. Today carries `aria-current="date"` and a strong edge, the
 * chosen day `aria-selected` and an ink fill: neither is told by colour alone.
 * Names and numbers come from `Intl` in the page locale, in the Gregorian
 * calendar the value is written in.
 */
export function Calendar({
  value = "",
  onSelect,
  min,
  max,
  locale,
  dir,
  prevMonthLabel = "Önceki ay",
  nextMonthLabel = "Sonraki ay",
  todayLabel = "Bugün",
  className,
}: CalendarProps) {
  const { ref, lang } = usePageLocale<HTMLDivElement>(locale);
  const contextDir = useDirection();
  const rtl = (dir ?? contextDir) === "rtl";
  const titleId = useId();
  const selected = isIsoDate(value) ? value : "";
  const today = todayIso();
  const [focus, setFocus] = useState(() =>
    selected ? selected : clampIsoDate(today, min, max)
  );
  const moveFocus = useRef(false);
  const gridRef = useRef<HTMLTableElement>(null);

  // A new value from outside (typed into the field) brings its month into view.
  useEffect(() => {
    if (selected) setFocus(selected);
  }, [selected]);

  useLayoutEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-date="${focus}"]`)
      ?.focus();
  }, [focus]);

  const f = useMemo(() => formatters(lang), [lang]);
  const firstDay = useMemo(() => firstDayOfWeek(lang), [lang]);
  const view = parseIsoDate(focus) ?? { year: 2000, month: 1, day: 1 };
  // An empty cell has no date to key on: it is keyed by its week and column.
  const weeks = monthGrid(view.year, view.month, firstDay).map((week) => {
    const key = week.find((d) => d !== null) ?? "";
    return {
      key,
      cells: week.map((d, column) => ({ d, key: d ?? `${key}:${column}` })),
    };
  });
  // The column heads are the days of any one week (5 October 2026 is a Monday), from the locale's first day.
  const headers = Array.from({ length: 7 }, (_, i) =>
    addDays(startOfWeek("2026-10-05", firstDay), i)
  );
  const prevMonth = addMonths(focus, -1);
  const nextMonth = addMonths(focus, 1);
  const prevOpen = (() => {
    const p = parseIsoDate(prevMonth);
    return (
      p !== null &&
      prevMonth < focus &&
      monthHasDayWithin(p.year, p.month, min, max)
    );
  })();
  const nextOpen = (() => {
    const p = parseIsoDate(nextMonth);
    return (
      p !== null &&
      nextMonth > focus &&
      monthHasDayWithin(p.year, p.month, min, max)
    );
  })();
  const todayOpen = isWithin(today, min, max);

  // The month and today buttons are aria-disabled, never `disabled`: a button
  // that disables itself under the pointer or the keyboard would drop focus
  // to the page (MDS-A11Y-11).
  const pick = (date: string) => {
    if (!isWithin(date, min, max)) return;
    onSelect(date);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const target = event.target as HTMLElement;
    const at = target.dataset.date;
    if (!at) return;
    const forward = rtl ? -1 : 1;
    let next: string | null = null;
    switch (event.key) {
      case "ArrowRight":
        next = addDays(at, forward);
        break;
      case "ArrowLeft":
        next = addDays(at, -forward);
        break;
      case "ArrowDown":
        next = addDays(at, 7);
        break;
      case "ArrowUp":
        next = addDays(at, -7);
        break;
      case "Home":
        next = startOfWeek(at, firstDay);
        break;
      case "End":
        next = endOfWeek(at, firstDay);
        break;
      case "PageUp":
        next = event.shiftKey ? addYears(at, -1) : addMonths(at, -1);
        break;
      case "PageDown":
        next = event.shiftKey ? addYears(at, 1) : addMonths(at, 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        pick(at);
        return;
      default:
        return;
    }
    event.preventDefault();
    moveFocus.current = true;
    setFocus(next);
  };

  return (
    <div ref={ref} className={cx("mds-calendar", className)}>
      <div className="mds-calendar__head">
        <button
          type="button"
          className="mds-btn mds-icon-btn mds-btn--small mds-btn--ghost"
          aria-label={prevMonthLabel}
          aria-disabled={prevOpen ? undefined : true}
          onClick={() => {
            if (prevOpen) setFocus(prevMonth);
          }}
        >
          <Icon name="chevronLeft" />
        </button>
        <div id={titleId} className="mds-calendar__title" aria-live="polite">
          {f.title.format(utc(focus))}
        </div>
        <button
          type="button"
          className="mds-btn mds-icon-btn mds-btn--small mds-btn--ghost"
          aria-label={nextMonthLabel}
          aria-disabled={nextOpen ? undefined : true}
          onClick={() => {
            if (nextOpen) setFocus(nextMonth);
          }}
        >
          <Icon name="chevronRight" />
        </button>
      </div>
      {/* biome-ignore lint/a11y: the APG date-picker grid is a table promoted to role="grid"; the day buttons inside are the interactive parts */}
      <table
        ref={gridRef}
        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the APG grid pattern promotes this table; its day buttons take the focus
        role="grid"
        aria-labelledby={titleId}
        className="mds-calendar__grid"
        onKeyDown={onKeyDown}
      >
        <thead>
          <tr>
            {headers.map((d) => (
              <th
                key={d}
                scope="col"
                abbr={f.weekdayLong.format(utc(d))}
                className="mds-calendar__weekday"
              >
                {f.weekdayShort.format(utc(d))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map(({ key, cells }) => (
            <tr key={key}>
              {cells.map(({ d, key: cellKey }) =>
                d === null ? (
                  <td key={cellKey} />
                ) : (
                  // biome-ignore lint/a11y: a td in a role="grid" table, named gridcell so it can carry aria-selected; its button takes the focus
                  <td
                    key={d}
                    // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a td in a role="grid" table is a gridcell already (HTML-AAM)
                    role="gridcell"
                    aria-selected={d === selected ? true : undefined}
                  >
                    <button
                      type="button"
                      data-date={d}
                      tabIndex={d === focus ? 0 : -1}
                      aria-label={f.dayName.format(utc(d))}
                      aria-current={d === today ? "date" : undefined}
                      aria-disabled={isWithin(d, min, max) ? undefined : true}
                      className="mds-calendar__day"
                      onClick={() => {
                        setFocus(d);
                        pick(d);
                      }}
                    >
                      {formatNumber(Number(d.slice(8)), lang)}
                    </button>
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mds-calendar__foot">
        <button
          type="button"
          className="mds-btn mds-btn--small mds-btn--ghost"
          aria-disabled={todayOpen ? undefined : true}
          onClick={() => {
            if (!todayOpen) return;
            setFocus(today);
            pick(today);
          }}
        >
          {todayLabel}
        </button>
      </div>
    </div>
  );
}
