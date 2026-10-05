"use client";

import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

/**
 * A page that threw while it rendered. It does not cover the layouts above it,
 * so a failed read of the roles is handled where it is made
 * (`PortalUnavailable`); this is for the rest.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("nazar.Shell");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <SystemState
      kind="error"
      title={t("errorTitle")}
      action={
        <Button variant="secondary" onClick={() => retry()}>
          {t("retry")}
        </Button>
      }
    >
      {t("errorText")}
    </SystemState>
  );
}
