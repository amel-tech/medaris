"use client";

import { Field as BaseField } from "@base-ui/react/field";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { cx } from "./cx";

export interface InputProps
  extends Omit<ComponentProps<"input">, "size" | "ref"> {
  size?: "mini" | "small" | "regular" | "large";
  /** the Meeting-link look: Atkinson Mono, always left to right */
  mono?: boolean;
  /** a decorative glyph before the text */
  leading?: ReactNode;
  /** a decorative unit after the text; also write it into the label */
  trailing?: ReactNode;
}

// The types whose value comes from a picker. Chromium opens it only from its
// own icon, so a click on the text did nothing visible (MDRS-277).
const PICKER_TYPES = new Set([
  "date",
  "time",
  "datetime-local",
  "month",
  "week",
]);

function openPicker(event: MouseEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  if (!PICKER_TYPES.has(input.type) || input.readOnly || input.disabled) return;
  try {
    input.showPicker?.();
  } catch {
    // no user activation, or a cross-origin frame: the icon still works
  }
}

/**
 * `.mds-input` on Base UI's `Field.Control`. Always inside a `Field`
 * (canvas rule 9), which owns the label, the help and `aria-invalid`.
 * A date or time input opens its picker on a click anywhere in the field.
 */
export function Input({
  size = "regular",
  mono = false,
  leading,
  trailing,
  className,
  onClick,
  ...rest
}: InputProps) {
  const input = (
    <BaseField.Control
      {...rest}
      onClick={(event: MouseEvent<HTMLInputElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) openPicker(event);
      }}
      dir={mono ? "ltr" : rest.dir}
      className={cx(
        "mds-input",
        size !== "regular" && `mds-input--${size}`,
        mono && "mds-input--mono",
        className
      )}
    />
  );
  if (!leading && !trailing) return input;
  return (
    <span className="mds-input-group">
      {leading ? (
        <span className="mds-input-group__leading" aria-hidden="true">
          {leading}
        </span>
      ) : null}
      {input}
      {trailing ? (
        <span className="mds-input-group__trailing" aria-hidden="true">
          {trailing}
        </span>
      ) : null}
    </span>
  );
}
