import { LockSimpleIcon } from "@medaris/icons/ssr";
import { Button } from "@medaris/ui/components/button";
import { Card, CardContent } from "@medaris/ui/components/card";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * Shown in place of a deck the API refused (403) or could not find (404).
 *
 * The two cases render the same copy on purpose: telling a caller "this deck
 * exists but is private" leaks what "not found" hides (MDRS-43, AC-4).
 */
export async function DeckUnavailable() {
  const t = await getTranslations("tedris.DeckUnavailable");

  return (
    <div className="mx-auto flex max-w-md px-4 py-16">
      <Card className="w-full">
        <CardContent className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <LockSimpleIcon className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
          <Button asChild className="mt-2">
            <Link href="/decks">{t("backToDecks")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
