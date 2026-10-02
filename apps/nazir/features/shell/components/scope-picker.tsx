"use client";

import { Menu } from "@base-ui/react/menu";
import { Avatar } from "@medaris/ui/mds/avatar";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { Icon } from "@medaris/ui/mds/icon";
import { joinRun } from "@medaris/ui/mds/locale";
import type { ScopeKind } from "../scope";

export interface ScopeOption {
  key: string;
  kind: ScopeKind;
  id: string;
  href: string;
  name: string;
  /** the second line of the closed picker: the role, and "dersin imamı" */
  summary: string[];
  /** the second line in the open list: the summary and a course's köşk */
  detail: string[];
}

export interface ScopePickerProps {
  current: ScopeOption;
  options: ScopeOption[];
  labels: {
    /** the closed picker's name, "Kapsam değiştir: {medrese}" */
    change: string;
    /** the open list's name */
    menu: string;
    medrese: string;
    courses: string;
    note: string;
  };
}

function Mark({ option }: { option: ScopeOption }) {
  return option.kind === "medrese" ? (
    <Avatar name={option.name} size="sm" entity decorative />
  ) : (
    <CoverPattern seed={option.id} size="xs" label="" />
  );
}

function Lines({ name, parts }: { name: string; parts: string[] }) {
  return (
    <span className="flex min-inline-0 flex-col gap-[2px] text-start">
      <span className="text-body-sm font-semibold leading-ui" dir="auto">
        <bdi>{name}</bdi>
      </span>
      <span className="mds-caption">{joinRun(parts)}</span>
    </span>
  );
}

/**
 * The scope picker (nazir 03): the medrese and the courses the person holds,
 * in a Base UI Menu whose rows are links (`Menu.LinkItem`), so a scope is
 * chosen by going to its address and the page that opens remembers it. With
 * one scope there is nothing to choose and the picker is a plain card, not a
 * control. The list's looks are the system's `.mds-popup`/`.mds-option`
 * (canvas rule 22); only the place is Tailwind.
 */
export function ScopePicker({ current, options, labels }: ScopePickerProps) {
  const currentMark = <Mark option={current} />;

  if (options.length < 2) {
    return (
      <div className="mds-card flex items-center gap-3 p-3">
        {currentMark}
        <Lines name={current.name} parts={current.summary} />
      </div>
    );
  }

  const groups = [
    {
      kind: "medrese" as const,
      label: labels.medrese,
      options: options.filter((option) => option.kind === "medrese"),
    },
    {
      kind: "ders" as const,
      label: labels.courses,
      options: options.filter((option) => option.kind === "ders"),
    },
  ].filter((group) => group.options.length > 0);

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={labels.change}
        className="mds-btn mds-btn--outline inline-full block-auto min-block-control justify-start gap-3 py-2 whitespace-normal"
      >
        {currentMark}
        <Lines name={current.name} parts={current.summary} />
        <Icon
          name="chevronsUpDown"
          size="sm"
          className="ms-auto shrink-0 text-neutral-subtle"
        />
      </Menu.Trigger>
      <Menu.Portal>
        {/* Above the phone sheet (z 61): the picker also opens from inside it. */}
        <Menu.Positioner sideOffset={4} align="start" className="z-70">
          <Menu.Popup
            aria-label={labels.menu}
            className="mds-popup max-inline-[min(26rem,90vw)] min-inline-[min(22rem,90vw)]"
          >
            {groups.map((group) => (
              <Menu.Group key={group.kind} className="flex flex-col gap-[2px]">
                <Menu.GroupLabel className="mds-eyebrow px-3 pbs-3 pbe-1">
                  {group.label}
                </Menu.GroupLabel>
                {group.options.map((option) => (
                  <Menu.LinkItem
                    key={option.key}
                    href={option.href}
                    className="mds-option gap-3 py-2 aria-[current=true]:bg-brand-subtle"
                    aria-current={
                      option.key === current.key ? "true" : undefined
                    }
                  >
                    <Mark option={option} />
                    <Lines name={option.name} parts={option.detail} />
                    {option.key === current.key ? (
                      <Icon
                        name="check"
                        size="sm"
                        className="ms-auto shrink-0"
                      />
                    ) : null}
                  </Menu.LinkItem>
                ))}
              </Menu.Group>
            ))}
            <p className="mds-caption mbs-1 border-bs border-neutral-subtle px-3 py-3">
              {labels.note}
            </p>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
