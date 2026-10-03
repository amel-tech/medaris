import { Field as BaseField } from "@base-ui/react/field";
import type { ComponentProps } from "react";
import { cx } from "./cx";

export type TextareaProps = Omit<ComponentProps<"textarea">, "ref">;

/**
 * `.mds-input .mds-textarea`: `Field.Control` rendered as a `<textarea>`
 * (canvas rule 17). Always inside a `Field`.
 */
export function Textarea({ className, ...rest }: TextareaProps) {
  return (
    <BaseField.Control
      {...(rest as object)}
      render={<textarea />}
      className={cx("mds-input", "mds-textarea", className)}
    />
  );
}
