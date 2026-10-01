import type { Metadata } from "next";

/** Longest description a link preview shows in full. */
const DESCRIPTION_MAX = 200;

/**
 * Title, description and Open Graph tags for a köşk, medrese or course intro
 * page (MDRS-122). `subject` is what a caller with no token got from tedrisat
 * — null when it answered 404 (unlisted köşk, draft, hidden course) or could
 * not be reached — and then only the generic site title is used, so a shared
 * link never names what a signed-out visitor may not see.
 *
 * `path` is the page's own path, resolved against `metadataBase`.
 */
export function introMetadata({
  subject,
  path,
  siteName,
  metadataBase,
}: {
  subject: { title: string; description?: string | null } | null;
  path: string;
  siteName: string;
  metadataBase: URL;
}): Metadata {
  if (!subject) {
    return { title: siteName, metadataBase };
  }
  const title = `${subject.title} · ${siteName}`;
  const description = shorten(subject.description);
  return {
    title,
    description,
    metadataBase,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName,
      title: subject.title,
      description,
      url: path,
    },
    twitter: { card: "summary", title: subject.title, description },
  };
}

function shorten(text: string | null | undefined): string | undefined {
  const flat = text?.replace(/\s+/g, " ").trim();
  if (!flat) return undefined;
  if (flat.length <= DESCRIPTION_MAX) return flat;
  return `${flat.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`;
}
