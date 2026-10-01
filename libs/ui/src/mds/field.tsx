import { Field as BaseField } from "@base-ui/react/field";
import type { ReactNode } from "react";
import { cx } from "./cx";

export interface FieldProps {
  label?: ReactNode;
  help?: ReactNode;
  /** replaces the help line; it does not stack under it */
  error?: ReactNode;
  required?: boolean;
  /** one control: Input, Textarea or Select */
  children: ReactNode;
  className?: string;
}

/**
 * A label, one control and one line under it: the help, or the error that
 * replaces it. Base UI's Field wires the label, the description and the
 * control's `aria-invalid`/`aria-describedby`; the classes are the system's.
 * The asterisk is decorative and the control carries `required`.
 */
export function Field({
  label,
  help,
  error,
  required = false,
  children,
  className,
}: FieldProps) {
  const hasError = Boolean(error);
  return (
    <BaseField.Root
      className={cx("mds-field", className)}
      invalid={hasError || undefined}
    >
      {label ? (
        <BaseField.Label className="mds-label">
          {label}
          {required ? (
            <span className="mds-required" aria-hidden="true">
              *
            </span>
          ) : null}
        </BaseField.Label>
      ) : null}
      {children}
      {hasError ? (
        <BaseField.Error match className="mds-error">
          {error}
        </BaseField.Error>
      ) : help ? (
        <BaseField.Description className="mds-help">
          {help}
        </BaseField.Description>
      ) : null}
    </BaseField.Root>
  );
}
