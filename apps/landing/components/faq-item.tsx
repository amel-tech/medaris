"use client";

import { type ReactNode, useState } from "react";

/**
 * One question of the Sık sorulan sorular page, in the system's week
 * accordion markup (design-system/medaris-unified/components/WeekAccordion
 * .prompt.md): a numbered trigger with aria-expanded, and a panel that
 * carries `hidden` while collapsed. Several items may be open at once.
 */
export function FaqItem({
  id,
  number,
  question,
  defaultOpen = false,
  children,
}: {
  /** the stem of the trigger's and panel's ids, unique on the page */
  id: string;
  number: number;
  question: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mds-week">
      <h3 className="mds-week__heading">
        <button
          className="mds-week__trigger"
          type="button"
          id={`${id}-b`}
          aria-expanded={open}
          aria-controls={`${id}-p`}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="mds-week__medallion" aria-hidden="true">
            {number}
          </span>
          <span className="mds-week__titles">
            <span className="mds-week__title">{question}</span>
          </span>
          <span className="mds-week__chevron" aria-hidden="true" />
        </button>
      </h3>
      <div className="mds-week__panel" id={`${id}-p`} hidden={!open}>
        <div className="mds-week__summary flex min-inline-0 flex-col gap-stack pbe-3">
          {children}
        </div>
      </div>
    </div>
  );
}
