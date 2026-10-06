"use client";

import { Field as BaseField } from "@base-ui/react/field";
import { Popover } from "@base-ui/react/popover";
import {
  type FocusEventHandler,
  type KeyboardEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  isTimeWithin,
  maskTimeInput,
  normalizeIsoTime,
  parseTimeInput,
  stepTime,
  timeOptions,
  toLocaleDigits,
} from "../lib/date-parts";
import { cx } from "./cx";
import { Icon } from "./icon";
import { labelling } from "./labelling";
import { usePageLocale } from "./locale";

export interface TimeFieldProps {
  /** "HH:mm" on a 24-hour clock, the native time input's value, or "" for empty */
  value?: string;
  /** the first value when the field keeps its own state */
  defaultValue?: string;
  /** a new "HH:mm", or "" when the field was emptied */
  onChange?: (value: string) => void;
  /** the typed text is not a time within `min`/`max` (true), or no longer is (false): the native `validity.badInput` */
  onBadInputChange?: (bad: boolean) => void;
  /** the earliest time that can be picked or typed, "HH:mm" */
  min?: string;
  /** the latest time that can be picked or typed, "HH:mm" */
  max?: string;
  /** the interval of the pick list, in minutes; typing and the arrow keys are not bound to it */
  stepMinutes?: number;
  /** posts the value as "HH:mm" under this name, from a hidden input */
  name?: string;
  /** the form the hidden input belongs to, when the field is outside it */
  form?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  /** shows the value, focusable and copyable, but neither typing nor the list change it */
  readOnly?: boolean;
  autoFocus?: boolean;
  /** marks the box invalid when a `Field` does not (the date-time field passes its field's state) */
  invalid?: boolean;
  /** the typing pattern; "SS:DD" in tr, "HH:MM" otherwise */
  placeholder?: string;
  size?: "mini" | "small" | "regular" | "large";
  /** a BCP 47 tag; the page's `lang` otherwise (MDS-NUM-01) */
  locale?: string;
  /** the list button's name, and the list's */
  listLabel?: string;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  className?: string;
}

const HOUR: [number, number] = [0, 2];
const MINUTE: [number, number] = [3, 5];

/**
 * A time field in place of `<input type="time">`, with the same value: "HH:mm"
 * or "". The native control follows the OS's clock, so the same page showed
 * "9:00 PM" on one machine and "21:00" on another; this one is always a
 * 24-hour clock. It is a masked `.mds-input` text box (Base UI
 * `Field.Control`): digits are typed and the colon writes itself ("2100" →
 * "21:00"), ArrowUp/ArrowDown step the hour or the minute under the caret,
 * and a complete time is taken as it is typed; a partial one ("9") is read on
 * blur or Enter. Text that is not a time, or falls outside `min`/`max`, marks
 * the box `aria-invalid` and keeps the last valid value.
 *
 * For a pointer, the clock button (or Alt+ArrowDown) opens a `.mds-popup`
 * listbox of the times at `stepMinutes` (15 by default: lessons start on the
 * quarter hour), the chosen one marked by weight and a check, not by colour.
 * Digits are written in the page locale's, as `formatNumber` writes them. With
 * `name`, a hidden input carries the value.
 */
export function TimeField({
  value,
  defaultValue = "",
  onChange,
  onBadInputChange,
  min,
  max,
  stepMinutes = 15,
  name,
  form,
  id,
  required,
  disabled = false,
  readOnly = false,
  autoFocus,
  invalid: invalidProp = false,
  placeholder,
  size = "regular",
  locale,
  listLabel = "Saat seç",
  onBlur,
  onFocus,
  className,
  ...aria
}: TimeFieldProps) {
  const { ref, lang } = usePageLocale<HTMLSpanElement>(locale);
  const controlled = value !== undefined;
  const [own, setOwn] = useState(defaultValue);
  const current = normalizeIsoTime(controlled ? value : own);
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const focusList = useRef(false);
  // As in DateField: a click elsewhere or on the button leaves the focus where it went.
  const keepFocus = useRef(false);
  const selection = useRef<[number, number] | null>(null);
  const locked = disabled || readOnly;
  const options = timeOptions(stepMinutes);
  // The row that takes focus in the list: the value, else the first time at or after it, else the first.
  const active =
    options.find((t) => t === current) ??
    options.find((t) => current !== "" && t > current) ??
    options[0];

  useLayoutEffect(() => {
    const range = selection.current;
    if (!range) return;
    selection.current = null;
    inputRef.current?.setSelectionRange(range[0], range[1]);
  });

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

  const accept = (parsed: string | null): boolean => {
    if (parsed === null || (parsed !== "" && !isTimeWithin(parsed, min, max))) {
      markBad(true);
      return false;
    }
    commit(parsed);
    return true;
  };

  const commitDraft = (): boolean =>
    draft === null ? true : accept(parseTimeInput(draft));

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const { key, altKey, currentTarget } = event;
    if (key === "Enter") {
      if (!commitDraft()) event.preventDefault();
      return;
    }
    if (locked) return;
    if (key === "ArrowDown" && altKey) {
      event.preventDefault();
      focusList.current = true;
      if (open) focusActive();
      else setOpen(true);
      return;
    }
    if (key !== "ArrowUp" && key !== "ArrowDown") return;
    event.preventDefault();
    const segment = (currentTarget.selectionStart ?? 0) <= 2 ? HOUR : MINUTE;
    const typed = draft === null ? current : parseTimeInput(draft);
    const next = typed
      ? stepTime(
          typed,
          segment === HOUR ? "hour" : "minute",
          key === "ArrowUp" ? 1 : -1
        )
      : "00:00";
    if (!isTimeWithin(next, min, max)) return;
    selection.current = segment;
    commit(next);
  };

  const focusActive = () => {
    listRef.current
      ?.querySelector<HTMLElement>('[role="option"][tabindex="0"]')
      ?.focus();
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const rows = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []
    );
    const at = rows.indexOf(event.target as HTMLElement);
    if (at < 0) return;
    let to = at;
    switch (event.key) {
      case "ArrowDown":
        to = Math.min(rows.length - 1, at + 1);
        break;
      case "ArrowUp":
        to = Math.max(0, at - 1);
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = rows.length - 1;
        break;
      case "PageDown":
        to = Math.min(rows.length - 1, at + 4);
        break;
      case "PageUp":
        to = Math.max(0, at - 4);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(rows[at]?.dataset.time ?? "");
        return;
      default:
        return;
    }
    event.preventDefault();
    for (const row of rows) row.tabIndex = -1;
    const row = rows[to];
    if (!row) return;
    row.tabIndex = 0;
    row.focus();
    row.scrollIntoView?.({ block: "nearest" });
  };

  const choose = (time: string) => {
    if (!time || !isTimeWithin(time, min, max)) return;
    commit(time);
    keepFocus.current = false;
    setOpen(false);
  };

  const outOfRange = current !== "" && !isTimeWithin(current, min, max);
  const invalid =
    bad || outOfRange || invalidProp || aria["aria-invalid"] === true;
  const text = draft ?? toLocaleDigits(current, lang);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next, details) => {
        if (!next && details.reason === "outside-press") {
          const target = details.event?.target as Node | null;
          if (target && ref.current?.contains(target)) return;
        }
        if (next) {
          if (details.reason === "trigger-press") focusList.current = true;
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
          aria-haspopup="listbox"
          required={required}
          disabled={disabled}
          readOnly={readOnly}
          autoFocus={autoFocus}
          placeholder={
            placeholder ??
            (lang.toLowerCase().startsWith("tr") ? "SS:DD" : "HH:MM")
          }
          {...labelling(aria)}
          {...(invalid ? { "aria-invalid": true } : {})}
          value={text}
          className={cx(
            "mds-input",
            "mds-timefield__input",
            size !== "regular" && `mds-input--${size}`
          )}
          onChange={(event) => {
            const { inputType } = event.nativeEvent as InputEvent;
            const masked = maskTimeInput(
              event.currentTarget.value,
              Boolean(inputType?.startsWith("delete"))
            );
            if (masked.length === 5) {
              const parsed = parseTimeInput(masked);
              if (parsed && isTimeWithin(parsed, min, max)) {
                commit(parsed);
                return;
              }
            }
            setDraft(toLocaleDigits(masked, lang));
          }}
          onClick={() => {
            if (locked || open) return;
            focusList.current = false;
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
          aria-label={listLabel}
          disabled={locked}
        >
          <Icon name="clock" size="sm" />
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
            aria-label={listLabel}
            lang={lang}
            className="mds-popup mds-timelist"
            initialFocus={() => {
              const row = listRef.current?.querySelector<HTMLElement>(
                '[role="option"][tabindex="0"]'
              );
              row?.scrollIntoView?.({ block: "nearest" });
              return focusList.current ? (row ?? true) : false;
            }}
            finalFocus={() => (keepFocus.current ? false : inputRef.current)}
          >
            <div
              ref={listRef}
              role="listbox"
              aria-label={listLabel}
              tabIndex={-1}
              onKeyDown={onListKeyDown}
            >
              {options.map((t) => {
                const selected = t === current;
                const off = !isTimeWithin(t, min, max);
                return (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: delegated; the listbox handles the keys for every row
                  <div
                    key={t}
                    role="option"
                    data-time={t}
                    tabIndex={t === active ? 0 : -1}
                    aria-selected={selected}
                    aria-disabled={off ? true : undefined}
                    data-selected={selected ? "" : undefined}
                    data-disabled={off ? "" : undefined}
                    className="mds-option"
                    onClick={() => choose(t)}
                  >
                    <span>{toLocaleDigits(t, lang)}</span>
                    {selected ? <Icon name="check" size="sm" /> : null}
                  </div>
                );
              })}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
