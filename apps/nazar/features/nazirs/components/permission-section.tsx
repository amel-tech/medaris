"use client";

import { Checkbox } from "@medaris/ui/mds/checkbox";
import type { ReactNode } from "react";

/**
 * One section of the permission dictionary ("Medrese", "Medrese dersleri") as
 * checkboxes in two columns, which nazir 06 and 16 share. A code the caller may
 * not give is off, as is one the dialog locks (a group's permission comes
 * ticked, with a line that says where it comes from).
 */
export function PermissionSection({
  title,
  codes,
  labelOf,
  ticked,
  locked,
  disabled,
  lockedNote,
  onToggle,
  children,
}: {
  title: string;
  codes: readonly string[];
  /** the sentence for a code */
  labelOf: (code: string) => string;
  ticked: (code: string) => boolean;
  /** ticked and not changeable here */
  locked?: (code: string) => boolean;
  disabled: (code: string) => boolean;
  lockedNote?: string;
  onToggle: (code: string, on: boolean) => void;
  /** what goes between the title and the boxes ("Hangi derslerde") */
  children?: ReactNode;
}) {
  return (
    <fieldset className="flex min-inline-0 flex-col gap-3 border-0 p-0">
      <legend className="mds-label pbe-3">{title}</legend>
      {children}
      <div className="grid gap-x-grid gap-y-3 md:grid-cols-2">
        {codes.map((code) => {
          const fixed = locked?.(code) ?? false;
          return (
            <Checkbox
              key={code}
              label={labelOf(code)}
              description={fixed ? lockedNote : undefined}
              checked={ticked(code)}
              disabled={fixed || disabled(code)}
              onCheckedChange={(on) => onToggle(code, on)}
            />
          );
        })}
      </div>
    </fieldset>
  );
}
