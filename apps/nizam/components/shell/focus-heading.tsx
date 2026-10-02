"use client";

import { useEffect } from "react";

/**
 * A page that is only a state (nizam 03) opens with focus on its `h1`: the
 * heading is made focusable for it and a screen reader starts reading there.
 * Draws nothing.
 */
export function FocusHeading() {
  useEffect(() => {
    const heading = document.querySelector<HTMLElement>("main h1");
    if (!heading) return;
    heading.setAttribute("tabindex", "-1");
    // focus is for the reader's start point, not a control: no ring around the title
    heading.style.outline = "none";
    heading.style.boxShadow = "none";
    heading.focus({ preventScroll: true });
  }, []);
  return null;
}
