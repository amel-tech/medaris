"use client";

import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Avatar } from "./avatar";
import { cx } from "./cx";
import { Icon } from "./icon";

export interface ScopeOption {
  value: string;
  label: string;
  href: string;
}

export interface ScopePickerProps {
  /** the scope in force: the köşk the nav is about */
  current: ScopeOption;
  options: ScopeOption[];
  /** under the name: the viewer's role in this scope ("Köşk nazımı") */
  caption?: string;
  /** read before the name by assistive technology ("Köşk değiştir:") */
  actionLabel: string;
  className?: string;
}

/**
 * The scope picker above the nav, outside it (canvas rule 18): the köşk a nazım
 * is working in, with a way to another one. A Base UI `Menu` of links; the
 * trigger is the canvas's `.ekran-kapsam` box written as utilities (the place
 * is Tailwind's, rule 33) around the system's `Avatar` and `Icon`. With one
 * scope only there is nothing to switch to, so the box is a plain label.
 */
export function ScopePicker({
  current,
  options,
  caption,
  actionLabel,
  className,
}: ScopePickerProps) {
  const body = (
    <>
      <Avatar name={current.label} size="sm" entity decorative />
      <span className="flex min-inline-0 flex-1 flex-col gap-[2px] text-start">
        <span className="mds-visually-hidden">{actionLabel} </span>
        <span className="font-semibold leading-[1.25]">
          <bdi>{current.label}</bdi>
        </span>
        {caption ? <span className="mds-caption">{caption}</span> : null}
      </span>
    </>
  );
  const box = cx(
    "mbe-3 flex inline-full items-center gap-3 rounded-control border border-neutral-control bg-neutral-surface px-3 py-2 text-body-sm text-neutral-default",
    className
  );
  if (options.length < 2) {
    return <div className={box}>{body}</div>;
  }
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger
        className={cx(box, "cursor-pointer hover:bg-neutral-hover")}
      >
        {body}
        <Icon name="chevronsUpDown" size="sm" />
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner sideOffset={4} align="start">
          <BaseMenu.Popup className="mds-popup">
            {options.map((o) => (
              <BaseMenu.LinkItem
                key={o.value}
                className="mds-option"
                href={o.href}
                aria-current={o.value === current.value ? "true" : undefined}
                data-selected={o.value === current.value ? "" : undefined}
              >
                <bdi>{o.label}</bdi>
              </BaseMenu.LinkItem>
            ))}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
