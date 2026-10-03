import { notFound } from "next/navigation";

/**
 * A path under a language that no page answers. Next shows only the
 * app-level 404 for it; calling `notFound()` from inside `[locale]` lets
 * `[locale]/not-found.tsx` answer instead, so the visitor gets the shell and
 * the "Bu bölüm için izniniz yok" screen (design nizam/06) rather than a bare
 * framework page.
 */
export default function CatchAll() {
  notFound();
}
