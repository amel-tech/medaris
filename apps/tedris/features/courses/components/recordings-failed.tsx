"use client";

import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

/**
 * The recordings tab when the read failed (design tedris/24, error state): a
 * system state inside the tab with a retry, which asks the server to render
 * the page again. Not the empty state: an empty list is a fact, this is not.
 */
export const RecordingsFailed = () => {
  const t = useTranslations("tedris.RecordingsTab");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <SystemState
      shell
      headingLevel={2}
      title={t("errorTitle")}
      action={
        <Button
          variant="outline"
          loading={pending}
          onClick={() => startTransition(() => router.refresh())}
        >
          {t("retry")}
        </Button>
      }
    >
      {t("errorText")}
    </SystemState>
  );
};
