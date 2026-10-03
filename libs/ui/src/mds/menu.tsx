"use client";

import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Fragment, type ReactNode } from "react";
import { cx } from "./cx";

export interface MenuItem {
  value: string;
  label: ReactNode;
  /** a decorative glyph before the label, an `<Icon>` from the caller */
  icon?: ReactNode;
  /** a rule is drawn above this row, to set it apart from the ones before it */
  divided?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface MenuProps {
  /** the trigger's accessible name; say what the menu is about ("Diğer işlemler: …") */
  label: string;
  /** the glyph, an `<Icon>` from the caller */
  icon: ReactNode;
  /** a visible name: the trigger becomes a small text button with the glyph before it, and `label` is no longer an aria-label */
  text?: string;
  items: MenuItem[];
  /** a line of small text at the foot of the open list, outside the rows */
  note?: ReactNode;
  size?: "mini" | "small" | "regular" | "large";
  className?: string;
}

/**
 * Base UI `Menu` behind an icon-only ghost `.mds-btn` (canvas rule 22: Menu
 * takes `.mds-popup` and, until the system names one, `.mds-option` for its
 * rows). Behaviour — arrow keys, typeahead, Esc, focus return — is Base UI's.
 * The trigger is `aria-haspopup="menu"` through Base UI.
 */
export function Menu({
  label,
  icon,
  text,
  items,
  note,
  size = "mini",
  className,
}: MenuProps) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger
        aria-label={text ? undefined : label}
        className={cx(
          "mds-btn",
          !text && "mds-icon-btn",
          `mds-btn--${size}`,
          "mds-btn--ghost",
          className
        )}
      >
        {icon}
        {text}
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner sideOffset={4} align="end">
          <BaseMenu.Popup className="mds-popup">
            {items.map((item) => (
              <Fragment key={item.value}>
                {item.divided ? (
                  <BaseMenu.Separator className="mds-popup__sep" />
                ) : null}
                <BaseMenu.Item
                  className="mds-option"
                  disabled={item.disabled}
                  onClick={item.onSelect}
                >
                  {item.icon}
                  {item.label}
                </BaseMenu.Item>
              </Fragment>
            ))}
            {note ? <p className="mds-popup__note">{note}</p> : null}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
