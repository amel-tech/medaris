"use client";

import { Checkbox } from "@medaris/ui/mds/checkbox";
import { useTranslations } from "next-intl";
import { type CatalogSections, codeKey } from "../present";

interface Props {
  sections: CatalogSections;
  /** codes that are ticked besides the locked ones */
  checked: ReadonlySet<string>;
  /** codes a group carries: ticked and not removable one by one */
  locked?: ReadonlySet<string>;
  onToggle: (code: string, on: boolean) => void;
  disabled?: boolean;
  /** a sentence appended to a code's help, for example when it was given */
  extraHelp?: Readonly<Record<string, string>>;
  /** what a locked box says in place of its help ("Gruptan gelir.") */
  lockedNote?: string;
}

/**
 * The permission boxes of nizam/12 and nizam/13: the catalog in its sections,
 * two columns on a wide window, each box a title and a help line. A box the
 * group carries is ticked, disabled and says where it comes from. The
 * sentences live in the messages (`nizam.PermissionCatalog`); the API only
 * knows codes.
 */
export function PermissionBoxes({
  sections,
  checked,
  locked,
  onToggle,
  disabled,
  extraHelp,
  lockedNote,
}: Props) {
  const t = useTranslations("nizam.PermissionCatalog");
  const text = t as unknown as {
    (key: string): string;
    has: (key: string) => boolean;
  };

  const helpOf = (code: string): string | undefined => {
    const key = `permissions.${codeKey(code)}.help`;
    const base = text.has(key) ? text(key) : undefined;
    const extra = extraHelp?.[code];
    return [base, extra].filter(Boolean).join(" ") || undefined;
  };

  return (
    <div className="grid gap-x-8 gap-y-6 md:grid-cols-2" data-testid="boxes">
      {sections.map((section) => (
        <section
          key={section.id}
          aria-labelledby={`perm-section-${section.id}`}
          className="flex flex-col gap-3"
          data-testid={`section-${section.id}`}
        >
          <h4 id={`perm-section-${section.id}`} className="mds-label">
            {text(`sections.${section.id}`)}
          </h4>
          {section.permissions.map((code) => {
            const fromGroup = locked?.has(code) ?? false;
            return (
              <Checkbox
                key={code}
                label={
                  section.id === "course"
                    ? text(`course.${codeKey(code)}`)
                    : text(`permissions.${codeKey(code)}.title`)
                }
                description={fromGroup ? lockedNote : helpOf(code)}
                checked={fromGroup || checked.has(code)}
                disabled={disabled || fromGroup}
                onCheckedChange={(on) => onToggle(code, on === true)}
                data-code={code}
              />
            );
          })}
          {section.id === "bans" ? (
            <p className="mds-caption">{text("bansNote")}</p>
          ) : null}
        </section>
      ))}
    </div>
  );
}
