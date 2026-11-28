"use client";

import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { type ReactNode, useRef } from "react";
import { cx } from "./cx";
import { Icon } from "./icon";

export interface MultiComboboxOption {
  value: string;
  label: string;
}

export interface MultiComboboxProps {
  options: MultiComboboxOption[];
  /** the chosen values, in the order they were chosen */
  value: string[];
  onChange: (value: string[]) => void;
  /** the text field's id, for a `<label htmlFor>` */
  id?: string;
  /** shown in the text field while nothing is chosen */
  placeholder?: string;
  /** the list's line when what is typed matches nothing */
  emptyText: string;
  /** the name of a chosen value's remove button ("Kaldır: 3. Kıyas") */
  removeLabel: (label: string) => string;
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A searchable list that holds several values (MDRS-248): Base UI `Combobox`
 * with `multiple`. The chosen values stand as chips in the `.mds-input` box
 * before a text field; typing filters the `.mds-popup` list (canvas rule 22:
 * the combobox reuses the select's open list), the arrow keys move in it,
 * Enter takes or drops the highlighted value and leaves the list open,
 * Backspace in an empty field drops the last chip, Escape closes the list
 * and never clears what was chosen.
 * A chosen row carries a ✓, never colour alone.
 */
export function MultiCombobox({
  options,
  value,
  onChange,
  id,
  placeholder,
  emptyText,
  removeLabel,
  disabled,
  className,
  ...aria
}: MultiComboboxProps): ReactNode {
  const anchor = useRef<HTMLDivElement | null>(null);
  const labelOf = new Map(options.map((o) => [o.value, o.label]));
  const label = (v: string) => labelOf.get(v) ?? v;
  return (
    <BaseCombobox.Root
      items={options.map((o) => o.value)}
      multiple
      value={value}
      // Base UI clears every chosen value on Escape while the list is shut;
      // here Escape only closes the list (MDRS-248, the owner: Esc'e basınca
      // seçilen konuların hepsi siliniyor). A chip is dropped by its own ×
      // or Backspace, one at a time.
      onValueChange={(next, details) => {
        if (details.reason === "escape-key") return;
        onChange(next as string[]);
      }}
      itemToStringLabel={label}
      disabled={disabled}
    >
      <BaseCombobox.Chips
        ref={anchor}
        className={cx("mds-input mds-combobox", className)}
      >
        <BaseCombobox.Value>
          {(chosen: string[]) => (
            <>
              {chosen.map((v) => (
                <BaseCombobox.Chip
                  key={v}
                  className="mds-combobox__chip"
                  aria-label={label(v)}
                >
                  <bdi>{label(v)}</bdi>
                  <BaseCombobox.ChipRemove
                    className="mds-combobox__remove"
                    aria-label={removeLabel(label(v))}
                  >
                    <Icon name="close" size="sm" />
                  </BaseCombobox.ChipRemove>
                </BaseCombobox.Chip>
              ))}
              <BaseCombobox.Input
                id={id}
                aria-label={aria["aria-label"]}
                placeholder={chosen.length > 0 ? undefined : placeholder}
                className="mds-combobox__input"
              />
            </>
          )}
        </BaseCombobox.Value>
      </BaseCombobox.Chips>
      <BaseCombobox.Portal>
        <BaseCombobox.Positioner
          sideOffset={4}
          anchor={anchor}
          className="mds-popup-positioner"
        >
          <BaseCombobox.Popup className="mds-popup">
            <BaseCombobox.Empty className="mds-popup__note">
              {emptyText}
            </BaseCombobox.Empty>
            <BaseCombobox.List>
              {(v: string) => (
                <BaseCombobox.Item key={v} value={v} className="mds-option">
                  <span className="mds-combobox__mark" aria-hidden="true">
                    <BaseCombobox.ItemIndicator>
                      <Icon name="check" size="sm" />
                    </BaseCombobox.ItemIndicator>
                  </span>
                  <bdi>{label(v)}</bdi>
                </BaseCombobox.Item>
              )}
            </BaseCombobox.List>
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>
  );
}
