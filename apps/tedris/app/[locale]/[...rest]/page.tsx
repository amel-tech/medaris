import { notFound } from "next/navigation";

/**
 * Catches every URL no page owns, so it is answered by `[locale]/not-found.tsx`
 * with the app shell around it (design tedris/38, criterion 1). Without it,
 * Next answers an unknown URL with the root not-found page, which has no shell.
 */
export default function UnknownPage() {
  notFound();
}
