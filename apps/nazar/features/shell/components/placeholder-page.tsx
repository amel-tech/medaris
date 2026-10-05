import { EmptyState } from "@medaris/ui/mds/empty-state";
import type { Metadata } from "next";
import { getMessages } from "~/lib/i18n/messages";

/**
 * The one page for every menu entry whose screen is not built yet (a heading
 * and a sentence), under the shell. `labelKey` is the entry's key under
 * `nazar.Nav` (`medrese.courses`). A package that builds a screen adds a
 * static route folder next to the placeholder's `[bolum]`, and that wins.
 */
export async function placeholderMetadata(labelKey: string): Promise<Metadata> {
  const t = await getMessages("nazar.Nav");
  return { title: t(labelKey) };
}

export async function PlaceholderPage({ labelKey }: { labelKey: string }) {
  const [nav, shell] = await Promise.all([
    getMessages("nazar.Nav"),
    getMessages("nazar.Shell"),
  ]);
  return (
    <>
      <h1 className="mds-h1">{nav(labelKey)}</h1>
      <EmptyState>{shell("placeholder")}</EmptyState>
    </>
  );
}
