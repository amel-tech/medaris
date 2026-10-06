"use client";

import { Field as BaseField } from "@base-ui/react/field";
import { Popover } from "@base-ui/react/popover";
import {
  type FocusEventHandler,
  type KeyboardEvent,
  useRef,
  useState,
} from "react";
import {
  dateInputPattern,
  formatDateInput,
  isIsoDate,
  isWithin,
  parseDateInput,
} from "../lib/date-parts";
import { Calendar, type CalendarLabels } from "./calendar";
import { cx } from "./cx";
import { Icon } from "./icon";
import { labelling } from "./labelling";
import { usePageLocale } from "./locale";

export interface DateFieldProps extends CalendarLabels {
  /** "YYYY-MM-DD", the native date input's value, or "" for empty */
  value?: string;
  /** the first value when the field keeps its own state */
  defaultValue?: string;
  /** a new "YYYY-MM-DD", or "" when the field was emptied */
  onChange?: (value: string) => void;
  /**
   * The typed text is not a date within `min`/`max` (true), or no longer is
   * (false): the native input's `validity.badInput`. The last valid value is
   * kept meanwhile, so a form that must not submit it checks this.
   */
  onBadInputChange?: (bad: boolean) => void;
  /** the first day that can be picked or typed, "YYYY-MM-DD" */
  min?: string;
  /** the last day that can be picked or typed, "YYYY-MM-DD" */
  max?: string;
  /** posts the value as "YYYY-MM-DD" under this name, from a hidden input */
  name?: string;
  /** the form the hidden input belongs to, when the field is outside it */
  form?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  /** shows the value, focusable and copyable, but neither typing nor the calendar change it */
  readOnly?: boolean;
  autoFocus?: boolean;
  /** the typing pattern, "GG.AA.YYYY" in tr; derived from the locale otherwise */
  placeholder?: string;
  size?: "mini" | "small" | "regular" | "large";
  /** a BCP 47 tag; the page's `lang` otherwise (MDS-NUM-01) */
  locale?: string;
  /** the calendar button's name */
  openLabel?: string;
  /** the calendar popup's name */
  dialogLabel?: string;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  className?: string;
}

/**
 * A date field in place of `<input type="date">`, with the same value: a
 * "YYYY-MM-DD" string or "". The native control draws its own widget, in the
 * browser's language and the OS's order, and cannot be styled; this one is a
 * `.mds-input` text box (Base UI `Field.Control`, so a `Field` labels it and
 * marks it invalid) with a calendar button that opens a `.mds-popup` popover
 * holding the month grid (`Calendar`).
 *
 * The box shows the date the way it is typed, in the locale's numeric form
 * ("05.10.2026" in tr, "10/05/2026" in en-US): what is read can be edited in
 * place and read back without loss, which a long form ("5 Ekim 2026") would
 * not allow, and the placeholder names the order ("GG.AA.YYYY"). Typing is
 * read on blur and on Enter (`parseDateInput`); text that is not a date, or
 * falls outside `min`/`max`, marks the box `aria-invalid` and keeps the last
 * valid value. Clicking the box opens the calendar without taking focus from
 * the text; the button, ArrowDown or Alt+ArrowDown move focus into the grid,
 * and Esc closes it and returns focus to the box. With `name`, a hidden input
 * carries the value, so a plain `<form>` post sees what the native input
 * would have sent; the visible box has no name and carries `required`.
 */
export function DateField({
  value,
  defaultValue = "",
  onChange,
  onBadInputChange,
  min,
  max,
  name,
  form,
  id,
  required,
  disabled = false,
  readOnly = false,
  autoFocus,
  placeholder,
  size = "regular",
  locale,
  openLabel = "Takvimi aç",
  dialogLabel = "Tarih seç",
  prevMonthLabel,
  nextMonthLabel,
  todayLabel,
  onBlur,
  onFocus,
  className,
  ...aria
}: DateFieldProps) {
  const { ref, lang } = usePageLocale<HTMLSpanElement>(locale);
  const controlled = value !== undefined;
  const [own, setOwn] = useState(defaultValue);
  const raw = controlled ? value : own;
  const current = isIsoDate(raw) ? raw : "";
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  // Where focus goes as the popup opens: into the grid (button, ArrowDown) or
  // nowhere (a click in the box, which keeps the caret in the text).
  const focusGrid = useRef(false);
  // Why it closed: a click elsewhere, or on the button, leaves the focus where
  // the click put it; Esc and a pick return it to the box.
  const keepFocus = useRef(false);
  const locked = disabled || readOnly;

  const markBad = (next: boolean) => {
    if (next === bad) return;
    setBad(next);
    onBadInputChange?.(next);
  };

  const commit = (next: string) => {
    setDraft(null);
    markBad(false);
    if (!controlled) setOwn(next);
    if (next !== current) onChange?.(next);
  };

  /** Reads the typed text; false when it is not a date in range. */
  const commitDraft = (): boolean => {
    if (draft === null) return true;
    const parsed = parseDateInput(draft, lang);
    if (parsed === null || (parsed !== "" && !isWithin(parsed, min, max))) {
      markBad(true);
      return false;
    }
    commit(parsed);
    return true;
  };

  const openGrid = () => {
    focusGrid.current = true;
    if (open) {
      popupRef.current
        ?.querySelector<HTMLElement>('.mds-calendar__day[tabindex="0"]')
        ?.focus();
    } else {
      setOpen(true);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      // A date that cannot be read must not submit the form with the old one.
      if (!commitDraft()) event.preventDefault();
    } else if (event.key === "ArrowDown" && !locked) {
      event.preventDefault();
      commitDraft();
      openGrid();
    }
  };

  const outOfRange = current !== "" && !isWithin(current, min, max);
  const invalid = bad || outOfRange || aria["aria-invalid"] === true;
  const text = draft ?? formatDateInput(current, lang);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next, details) => {
        if (!next && details.reason === "outside-press") {
          // The box is outside the popup but part of the field: a click in it keeps the calendar open.
          const target = details.event?.target as Node | null;
          if (target && ref.current?.contains(target)) return;
        }
        if (next) {
          if (details.reason === "trigger-press") focusGrid.current = true;
        } else {
          keepFocus.current =
            details.reason === "outside-press" ||
            details.reason === "focus-out" ||
            details.reason === "trigger-press";
        }
        setOpen(next);
      }}
    >
      <span ref={ref} className={cx("mds-datefield", className)}>
        <BaseField.Control
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-haspopup="dialog"
          required={required}
          disabled={disabled}
          readOnly={readOnly}
          autoFocus={autoFocus}
          placeholder={placeholder ?? dateInputPattern(lang).placeholder}
          {...labelling(aria)}
          {...(invalid ? { "aria-invalid": true } : {})}
          value={text}
          className={cx(
            "mds-input",
            size !== "regular" && `mds-input--${size}`
          )}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onClick={() => {
            if (locked || open) return;
            focusGrid.current = false;
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={(event) => {
            commitDraft();
            onBlur?.(event);
          }}
        />
        <Popover.Trigger
          className={cx(
            "mds-btn",
            "mds-icon-btn",
            "mds-btn--ghost",
            size === "large" ? "mds-btn--small" : "mds-btn--mini",
            "mds-datefield__trigger"
          )}
          aria-label={openLabel}
          disabled={locked}
        >
          <Icon name="calendar" size="sm" />
        </Popover.Trigger>
        {name ? (
          <input
            type="hidden"
            name={name}
            form={form}
            value={current}
            disabled={disabled}
          />
        ) : null}
      </span>
      <Popover.Portal>
        <Popover.Positioner
          anchor={ref}
          side="bottom"
          align="start"
          sideOffset={4}
          className="mds-popup-positioner"
        >
          <Popover.Popup
            ref={popupRef}
            aria-label={dialogLabel}
            lang={lang}
            className="mds-popup mds-datepicker"
            initialFocus={() =>
              focusGrid.current
                ? (popupRef.current?.querySelector<HTMLElement>(
                    '.mds-calendar__day[tabindex="0"]'
                  ) ?? true)
                : false
            }
            finalFocus={() => (keepFocus.current ? false : inputRef.current)}
          >
            <Calendar
              value={current}
              min={min}
              max={max}
              locale={lang}
              prevMonthLabel={prevMonthLabel}
              nextMonthLabel={nextMonthLabel}
              todayLabel={todayLabel}
              onSelect={(date) => {
                commit(date);
                keepFocus.current = false;
                setOpen(false);
              }}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
