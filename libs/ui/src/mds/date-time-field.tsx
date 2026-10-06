"use client";

import { Field as BaseField } from "@base-ui/react/field";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { joinDateTime, splitDateTime } from "../lib/date-parts";
import type { CalendarLabels } from "./calendar";
import { cx } from "./cx";
import { DateField } from "./date-field";
import { TimeField } from "./time-field";

export interface DateTimeFieldProps extends CalendarLabels {
  /** "YYYY-MM-DDTHH:mm", the native datetime-local value, or "" for empty */
  value?: string;
  /** the first value when the field keeps its own state */
  defaultValue?: string;
  /** a new "YYYY-MM-DDTHH:mm", or "" while either half is empty */
  onChange?: (value: string) => void;
  /**
   * Either half holds text that cannot be read, or only one half is filled
   * (true), or neither any more (false): the native `validity.badInput`.
   */
  onBadInputChange?: (bad: boolean) => void;
  /** "YYYY-MM-DDTHH:mm": bounds the date, and the time on that same day */
  min?: string;
  /** "YYYY-MM-DDTHH:mm": bounds the date, and the time on that same day */
  max?: string;
  /** the time list's interval in minutes */
  stepMinutes?: number;
  /** posts "YYYY-MM-DDTHH:mm" under this name, from one hidden input */
  name?: string;
  form?: string;
  /** the date box's id: a `Field`'s label points at it */
  id?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
  size?: "mini" | "small" | "regular" | "large";
  /** a BCP 47 tag; the page's `lang` otherwise (MDS-NUM-01) */
  locale?: string;
  /** the time box's name, read after the field's label ("Bitiş, Saat") */
  timeLabel?: string;
  /** the calendar button's name */
  openLabel?: string;
  /** the calendar popup's name */
  dialogLabel?: string;
  /** the time list button's name */
  listLabel?: string;
  datePlaceholder?: string;
  timePlaceholder?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  className?: string;
}

interface Wiring {
  labelledBy?: string;
  describedBy?: string;
  invalid: boolean;
}

const sameWiring = (a: Wiring, b: Wiring) =>
  a.labelledBy === b.labelledBy &&
  a.describedBy === b.describedBy &&
  a.invalid === b.invalid;

/**
 * A date-time field in place of `<input type="datetime-local">`, with the same
 * value: "YYYY-MM-DDTHH:mm", or "" until both halves are filled, as the native
 * input reports a half-typed value. A `DateField` and a `TimeField` side by
 * side, wrapping below each other when the row is narrow, and one hidden
 * input under `name` with the joined value.
 *
 * Inside a `Field`, the label points at the date box. The time box sits in a
 * `Field` of its own, so it does not take the label over; it is named by the
 * same label plus `timeLabel` ("Saat"), described by the same help or error,
 * and turns invalid with the field, all read from the date box as Base UI
 * wires it.
 *
 * `min` and `max` are kept simple: their date bounds the calendar and the
 * typed date, and their time bounds the time only on that same day. A time
 * left outside the bound when the date moves onto it is kept and shown
 * invalid; the joined value is still reported, so the caller's own check
 * remains the authority, as with the native input's `rangeUnderflow`.
 */
export function DateTimeField({
  value,
  defaultValue = "",
  onChange,
  onBadInputChange,
  min,
  max,
  stepMinutes,
  name,
  form,
  id,
  required,
  disabled = false,
  readOnly = false,
  autoFocus,
  size,
  locale,
  timeLabel = "Saat",
  openLabel,
  dialogLabel,
  listLabel,
  datePlaceholder,
  timePlaceholder,
  prevMonthLabel,
  nextMonthLabel,
  todayLabel,
  className,
  ...aria
}: DateTimeFieldProps) {
  const controlled = value !== undefined;
  const [own, setOwn] = useState(defaultValue);
  const external = controlled ? value : own;
  const [parts, setParts] = useState(() => splitDateTime(external));
  const [seen, setSeen] = useState(external);
  const [badDate, setBadDate] = useState(false);
  const [badTime, setBadTime] = useState(false);
  const [wiring, setWiring] = useState<Wiring>({ invalid: false });
  const rootRef = useRef<HTMLDivElement>(null);
  const timeLabelId = useId();
  const reported = useRef(false);

  // A new value from outside replaces the halves, unless it is what they already join to
  // ("" while one half is still being filled in).
  if (external !== seen) {
    setSeen(external);
    const next = splitDateTime(external);
    if (
      joinDateTime(next.date, next.time) !==
      joinDateTime(parts.date, parts.time)
    ) {
      setParts(next);
    }
  }

  const joined = joinDateTime(parts.date, parts.time);
  const partial = (parts.date === "") !== (parts.time === "");
  const bad = badDate || badTime || partial;

  useEffect(() => {
    if (bad === reported.current) return;
    reported.current = bad;
    onBadInputChange?.(bad);
  }, [bad, onBadInputChange]);

  // The time box mirrors what Base UI wrote on the date box: the label, the
  // help or error, and the field's invalid state, which can change without
  // this component rendering (Base UI's own validation).
  useLayoutEffect(() => {
    const input = rootRef.current?.querySelector<HTMLInputElement>(
      ".mds-datetime__date > .mds-input"
    );
    if (!input) return;
    const read = () => {
      const next: Wiring = {
        labelledBy: input.getAttribute("aria-labelledby") ?? undefined,
        describedBy: input.getAttribute("aria-describedby") ?? undefined,
        invalid: input.hasAttribute("data-invalid"),
      };
      setWiring((prev) => (sameWiring(prev, next) ? prev : next));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(input, {
      attributes: true,
      attributeFilter: ["aria-labelledby", "aria-describedby", "data-invalid"],
    });
    return () => observer.disconnect();
  }, []);

  const update = (date: string, time: string) => {
    setParts({ date, time });
    const next = joinDateTime(date, time);
    if (!controlled) {
      setOwn(next);
      setSeen(next);
    }
    if (next !== joined) onChange?.(next);
  };

  const lo = splitDateTime(min);
  const hi = splitDateTime(max);
  const labelledBy = aria["aria-labelledby"] ?? wiring.labelledBy;
  const describedBy = aria["aria-describedby"] ?? wiring.describedBy;

  return (
    <div ref={rootRef} className={cx("mds-datetime", className)}>
      <DateField
        className="mds-datetime__date"
        value={parts.date}
        onChange={(date) => update(date, parts.time)}
        onBadInputChange={setBadDate}
        min={lo.date || undefined}
        max={hi.date || undefined}
        id={id}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        autoFocus={autoFocus}
        size={size}
        locale={locale}
        placeholder={datePlaceholder}
        openLabel={openLabel}
        dialogLabel={dialogLabel}
        prevMonthLabel={prevMonthLabel}
        nextMonthLabel={nextMonthLabel}
        todayLabel={todayLabel}
        aria-label={aria["aria-label"]}
        aria-labelledby={aria["aria-labelledby"]}
        aria-describedby={aria["aria-describedby"]}
        aria-invalid={aria["aria-invalid"]}
      />
      <BaseField.Root
        className="mds-datetime__time"
        disabled={disabled}
        invalid={wiring.invalid || aria["aria-invalid"] === true || undefined}
      >
        <span id={timeLabelId} className="mds-visually-hidden">
          {timeLabel}
        </span>
        <TimeField
          value={parts.time}
          onChange={(time) => update(parts.date, time)}
          onBadInputChange={setBadTime}
          min={parts.date && parts.date === lo.date ? lo.time : undefined}
          max={parts.date && parts.date === hi.date ? hi.time : undefined}
          stepMinutes={stepMinutes}
          required={required}
          disabled={disabled}
          readOnly={readOnly}
          size={size}
          locale={locale}
          placeholder={timePlaceholder}
          listLabel={listLabel}
          invalid={wiring.invalid}
          {...(labelledBy
            ? { "aria-labelledby": `${labelledBy} ${timeLabelId}` }
            : {
                "aria-label": aria["aria-label"]
                  ? `${aria["aria-label"]}, ${timeLabel}`
                  : timeLabel,
              })}
          aria-describedby={describedBy}
          aria-invalid={aria["aria-invalid"]}
        />
      </BaseField.Root>
      {name ? (
        <input
          type="hidden"
          name={name}
          form={form}
          value={joined}
          disabled={disabled}
        />
      ) : null}
    </div>
  );
}
