import { notFound } from "next/navigation";

/**
 * A path no page answers. Calling `notFound()` here lets the `not-found.tsx`
 * next to this file answer instead of `app/not-found.tsx` ("izniniz yok"), so the visitor gets the
 * shell and "Sayfa bulunamadı" (MDRS-211) rather than a bare framework page.
 */
export default function CatchAll() {
  notFound();
}
