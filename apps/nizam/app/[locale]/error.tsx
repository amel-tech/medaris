"use client";

import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

/**
 * A page under the shell threw: a read that does not catch its own failure
 * (the decks pages call the API with no try), or a client component that
 * failed to render. The shell around it stays, so the nazım keeps the menu;
 * the error itself is never shown, only its digest goes to the console.
 * "Yeniden dene" is Next's `retry`, which reads the page from the server
 * again; `reset` would only re-render what failed.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("nizam.PageError");

  useEffect(() => {
    console.error("Segment error:", error.digest ?? error.message);
  }, [error]);

  return (
    <SystemState
      shell
      title={t("title")}
      action={
        <Button variant="secondary" onClick={() => retry()}>
          {t("retry")}
        </Button>
      }
    >
      {t("body")}
    </SystemState>
  );
}
