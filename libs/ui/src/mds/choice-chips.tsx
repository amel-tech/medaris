import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { type ReactNode, useId, useState } from "react";
import { cx } from "./cx";

export interface ChipOption {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

interface ChipsBase {
  legend: string;
  legendVisible?: boolean;
  /** with a name, the chosen values are submitted as hidden inputs */
  name?: string;
  options: ChipOption[];
  className?: string;
}

export type ChoiceChipsProps = ChipsBase &
  (
    | {
        multiple?: false;
        value?: string | null;
        defaultValue?: string | null;
        onChange?: (value: string | null) => void;
      }
    | {
        multiple: true;
        value?: string[];
        defaultValue?: string[];
        onChange?: (value: string[]) => void;
      }
  );

const asArray = (
  v: string | string[] | null | undefined
): string[] | undefined =>
  v === undefined ? undefined : v === null ? [] : Array.isArray(v) ? v : [v];

/**
 * Base UI `ToggleGroup` of `Toggle` chips (`.mds-chips`/`.mds-chip`, canvas rule
 * 5). One choice by default, any number with `multiple`. Toggles carry
 * `aria-pressed`; unlike the native-input chip they submit nothing by
 * themselves, so `name` renders the hidden inputs.
 */
export function ChoiceChips(props: ChoiceChipsProps) {
  const { legend, legendVisible = false, name, options, className } = props;
  const multiple = props.multiple === true;
  const legendId = `mds-chips-${useId().replace(/[^\w-]/g, "")}`;
  const controlled = asArray(props.value);
  const [inner, setInner] = useState<string[]>(
    asArray(props.defaultValue) ?? []
  );
  const chosen = controlled ?? inner;
  const change = (next: string[]) => {
    setInner(next);
    if (multiple)
      (props.onChange as ((v: string[]) => void) | undefined)?.(next);
    else
      (props.onChange as ((v: string | null) => void) | undefined)?.(
        next[0] ?? null
      );
  };
  return (
    <div className="mds-chips-field">
      <div
        className={legendVisible ? "mds-label" : "mds-visually-hidden"}
        id={legendId}
      >
        {legend}
      </div>
      <ToggleGroup
        multiple={multiple}
        value={chosen}
        onValueChange={(v) => change(v.map(String))}
        aria-labelledby={legendId}
        className={cx("mds-chips", className)}
      >
        {options.map((o) => (
          <Toggle
            key={o.value}
            value={o.value}
            disabled={o.disabled}
            className="mds-chip"
          >
            {o.icon}
            {o.label}
          </Toggle>
        ))}
      </ToggleGroup>
      {name
        ? chosen.map((v) => (
            <input key={v} type="hidden" name={name} value={v} />
          ))
        : null}
    </div>
  );
}
