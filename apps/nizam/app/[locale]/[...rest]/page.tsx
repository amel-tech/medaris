import { notFound } from "next/navigation";

/**
 * A path under a language that no page answers. Next shows only the
 * app-level 404 for it; calling `notFound()` from inside `[locale]` lets the
 * `not-found.tsx` next to this file answer instead, so the visitor gets the
 * shell and "Sayfa bulunamadı" (MDRS-211) rather than a bare framework page.
 */
export default function CatchAll() {
  notFound();
}
