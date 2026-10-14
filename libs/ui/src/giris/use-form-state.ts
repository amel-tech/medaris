"use client";

import { type RefObject, useEffect } from "react";

// Every control a field can be drawn with: a text input or area, a box, a
// radio (Base UI's span) and a select's trigger.
const INVALID_CONTROL = [
  "input",
  "textarea",
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="combobox"]',
]
  .map((control) => `${control}[aria-invalid="true"]`)
  .join(", ");

/**
 * After a failed client-side check, puts the focus on the first control the
 * form marked invalid, so a keyboard or screen-reader user lands on the first
 * thing to fix instead of staying on the submit button.
 */
export function useFocusFirstInvalid(
  form: RefObject<HTMLFormElement | null>,
  trigger: unknown
) {
  useEffect(() => {
    if (!trigger) return;
    form.current?.querySelector<HTMLElement>(INVALID_CONTROL)?.focus();
  }, [trigger, form]);
}

/**
 * A submitted form that leaves the page and comes back from the browser's
 * history must not stay busy: the page is restored from the back-forward
 * cache with its state, and its button would still be waiting.
 */
export function usePageShowReset(reset: () => void) {
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) reset();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
}
