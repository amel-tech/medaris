import { notFound } from "next/navigation";
import {
  PlaceholderPage,
  placeholderMetadata,
} from "~/features/shell/components/placeholder-page";
import { findSegment } from "~/features/shell/nav";

type Props = { params: Promise<{ bolum: string }> };

export async function generateMetadata({ params }: Props) {
  const entry = findSegment("medrese", (await params).bolum);
  return entry ? placeholderMetadata(entry.labelKey) : {};
}

/** Every section of a medrese whose screen is not built yet; an unknown segment is a 404. */
export default async function Page({ params }: Props) {
  const entry = findSegment("medrese", (await params).bolum);
  if (!entry) notFound();
  return <PlaceholderPage labelKey={entry.labelKey} />;
}
