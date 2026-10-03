import { Select as BaseSelect } from "@base-ui/react/select";
import type { ReactNode } from "react";
import { cx } from "./cx";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: Array<SelectOption | string>;
  /** shown until something is chosen, so an unanswered select never looks answered */
  placeholder?: string;
  size?: "mini" | "small" | "regular" | "large";
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string | null) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-label"?: string;
  className?: string;
}

/**
 * Base UI `Select` in the `.mds-input` box; `.mds-select` draws the chevron
 * (canvas rule 8: no `Select.Icon`). Inside a `Field` it takes the label and
 * the error state from the field. The open list is `.mds-popup` with
 * `.mds-option` rows, which the class layer carries (baseui.css).
 */
export function Select({
  options,
  placeholder = "Seçin",
  size = "regular",
  value,
  defaultValue,
  onChange,
  name,
  id,
  disabled,
  required,
  className,
  ...aria
}: SelectProps): ReactNode {
  const items = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o
  );
  return (
    <BaseSelect.Root
      items={items}
      value={value}
      defaultValue={value === undefined ? (defaultValue ?? null) : undefined}
      onValueChange={onChange ? (v) => onChange(v as string | null) : undefined}
      name={name}
      disabled={disabled}
      required={required}
    >
      <span className={cx("mds-select", className)}>
        <BaseSelect.Trigger
          id={id}
          aria-label={aria["aria-label"]}
          className={cx(
            "mds-input",
            size !== "regular" && `mds-input--${size}`
          )}
        >
          <BaseSelect.Value placeholder={placeholder} />
        </BaseSelect.Trigger>
      </span>
      <BaseSelect.Portal>
        {/* above a dialog's scrim and viewport (z-index 61), as the scope picker's list is */}
        <BaseSelect.Positioner
          sideOffset={4}
          alignItemWithTrigger={false}
          className="mds-popup-positioner"
        >
          <BaseSelect.Popup className="mds-popup">
            <BaseSelect.List>
              {items.map((o) => (
                <BaseSelect.Item
                  key={o.value}
                  value={o.value}
                  disabled={"disabled" in o ? o.disabled : undefined}
                  className="mds-option"
                >
                  <BaseSelect.ItemText>{o.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
