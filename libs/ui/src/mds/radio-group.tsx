import { Radio as BaseRadio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import { type ReactNode, useId } from "react";
import { cx } from "./cx";

export interface RadioOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  /** the visible group name; the group is labelled by it */
  legend: ReactNode;
  name?: string;
  options: RadioOption[];
  /** `null` is a controlled "nothing selected" */
  value?: string | null;
  defaultValue?: string;
  onChange?: (value: string) => void;
  bordered?: boolean;
  required?: boolean;
  disabled?: boolean;
  /** one line under the options, as `Field` writes one under its control */
  help?: ReactNode;
  /** replaces the help line and marks every option invalid */
  error?: ReactNode;
  /** marks every option invalid when the reason is shown elsewhere */
  invalid?: boolean;
  className?: string;
}

/**
 * Base UI `RadioGroup` of `Radio` rows, each in its own `<label class="mds-choice">`
 * (`.mds-radio`, no Indicator, canvas rule 8). Controlled with `value`,
 * uncontrolled with `defaultValue`; no option is selected unless the caller says.
 *
 * A group is never inside `Field` (its legend is the label), so it writes its
 * own line under the options: the help, or the error that replaces it
 * (`.mds-help` / `.mds-error`). Every radio is described by that line, so it is
 * read when a radio takes focus, and an error marks every radio invalid.
 */
export function RadioGroup({
  legend,
  name,
  options,
  value,
  defaultValue,
  onChange,
  bordered = false,
  required,
  disabled,
  help,
  error,
  invalid = false,
  className,
}: RadioGroupProps) {
  const uid = useId().replace(/[^\w-]/g, "");
  const legendId = `mds-choice-${uid}-legend`;
  const lineId = error || help ? `mds-choice-${uid}-line` : undefined;
  const isInvalid = Boolean(error) || invalid;
  return (
    <BaseRadioGroup
      name={name}
      value={value}
      defaultValue={defaultValue}
      required={required}
      disabled={disabled}
      onValueChange={onChange ? (v) => onChange(String(v)) : undefined}
      aria-labelledby={legendId}
      className={cx("mds-choice-group", className)}
    >
      <div className="mds-label" id={legendId}>
        {legend}
      </div>
      {options.map((o, i) => {
        const labelId = `mds-choice-${uid}-${i}-l`;
        const descId = o.description ? `mds-choice-${uid}-${i}-d` : undefined;
        return (
          // biome-ignore lint/a11y/noLabelWithoutControl: Base UI's Radio.Root renders the control, a hidden input, inside this label
          <label
            key={o.value}
            className={cx("mds-choice", bordered && "mds-choice--bordered")}
          >
            <BaseRadio.Root
              value={o.value}
              disabled={o.disabled}
              className="mds-radio"
              aria-labelledby={labelId}
              aria-describedby={
                [descId, lineId].filter(Boolean).join(" ") || undefined
              }
              aria-invalid={isInvalid || undefined}
            />
            {o.icon ? (
              <span className="mds-choice__icon" aria-hidden="true">
                {o.icon}
              </span>
            ) : null}
            <span className="mds-choice__text">
              <span className="mds-choice__label" id={labelId}>
                {o.label}
              </span>
              {o.description ? (
                <span className="mds-choice__desc" id={descId}>
                  {o.description}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
      {error ? (
        <span className="mds-error" id={lineId}>
          {error}
        </span>
      ) : help ? (
        <span className="mds-help" id={lineId}>
          {help}
        </span>
      ) : null}
    </BaseRadioGroup>
  );
}
