"use client";

import { Popover } from "@base-ui/react/popover";
import { useId, useRef, useState } from "react";
import { cx } from "./cx";
import { Icon } from "./icon";

/** The star's words, from the caller's catalogue (`common.imamStar`). */
export interface ImamStarLabels {
  /** "Dersin imamı": the button's name and the bubble's title */
  title: string;
  /** what the imam is, the bubble's text */
  body: string;
  /** "dersin imamı": what a screen reader reads for a star that is not a button */
  mark: string;
}

export interface ImamStarProps {
  labels: ImamStarLabels;
  /**
   * false inside a link or a button, where no other button may go: the star
   * is drawn for the eye and read as words, and opens nothing.
   */
  interactive?: boolean;
  className?: string;
}

/**
 * The mark of a course's imam (the owner's decision of 2026-10-13): a filled
 * star in the rating gold, set on the text line after the name. Shown only
 * where the course has more than one müderris (`showsImamStar` in
 * `@medaris/ui/lib/imam-star`).
 *
 * Interactive, it is a small button named by the title. Hover, keyboard focus
 * and a tap each open a bubble with the title and what the imam is: a tooltip
 * opens on hover and focus only, and a phone has neither, so this is Base UI's
 * Popover (`openOnHover` and its click) with the focus added here. Esc, a press
 * outside and focus leaving the star close it. Focus never moves into the
 * bubble, so a Tab goes on to the next thing; the button is described by the
 * text, so a screen reader reads it on arriving.
 */
export function ImamStar({
  labels,
  interactive = true,
  className,
}: ImamStarProps) {
  if (!interactive) {
    return (
      <span className={cx("mds-imam-star", className)}>
        <Icon name="star" filled />
        <span className="mds-visually-hidden"> {labels.mark}</span>
      </span>
    );
  }
  return <ImamStarButton labels={labels} className={className} />;
}

function ImamStarButton({
  labels,
  className,
}: {
  labels: ImamStarLabels;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const described = useId();
  const popupRef = useRef<HTMLDivElement>(null);
  // A press focuses the button before its click, and the click opens or
  // closes the bubble: the focus that comes with a press must not open it first.
  const pressing = useRef(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        openOnHover
        delay={600}
        aria-label={labels.title}
        aria-describedby={described}
        className={cx("mds-imam-star", "mds-imam-star--button", className)}
        onPointerDown={() => {
          pressing.current = true;
        }}
        onClick={() => {
          pressing.current = false;
        }}
        onFocus={() => {
          if (!pressing.current) setOpen(true);
          pressing.current = false;
        }}
        onBlur={(event) => {
          const next = event.relatedTarget as Node | null;
          if (!next || !popupRef.current?.contains(next)) setOpen(false);
        }}
      >
        <Icon name="star" filled />
        <span id={described} hidden>
          {labels.body}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="top"
          sideOffset={6}
          className="mds-popup-positioner"
        >
          <Popover.Popup
            ref={popupRef}
            className="mds-tooltip mds-imam-star__bubble"
            initialFocus={false}
            finalFocus={false}
          >
            <Popover.Title render={<p />} className="mds-imam-star__title">
              {labels.title}
            </Popover.Title>
            <Popover.Description className="mds-imam-star__body">
              {labels.body}
            </Popover.Description>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
