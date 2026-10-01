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
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  bordered?: boolean;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Base UI `RadioGroup` of `Radio` rows, each in its own `<label class="mds-choice">`
 * (`.mds-radio`, no Indicator, canvas rule 8). Controlled with `value`,
 * uncontrolled with `defaultValue`; no option is selected unless the caller says.
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
  className,
}: RadioGroupProps) {
  const uid = useId().replace(/[^\w-]/g, "");
  const legendId = `mds-choice-${uid}-legend`;
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
              aria-describedby={descId}
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
    </BaseRadioGroup>
  );
}
