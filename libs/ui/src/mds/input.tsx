import { Field as BaseField } from "@base-ui/react/field";
import type { ComponentProps, ReactNode } from "react";
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

/**
 * `.mds-input` on Base UI's `Field.Control`. Always inside a `Field`
 * (canvas rule 9), which owns the label, the help and `aria-invalid`.
 */
export function Input({
  size = "regular",
  mono = false,
  leading,
  trailing,
  className,
  ...rest
}: InputProps) {
  const input = (
    <BaseField.Control
      {...rest}
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
