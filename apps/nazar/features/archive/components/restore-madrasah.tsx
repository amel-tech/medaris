"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { restoreMedrese } from "../actions";
import { madrasahRestoreErrorKey } from "../archive";

/**
 * The banner of a hidden medrese (nazir 12, MDRS-143): the page says the medrese
 * is hidden, and offers "Medreseyi geri getir" to whoever hid it or a level above.
 * For anyone else the sentence that names the kademe that hid it stands in the
 * button's place (`lockedNote`, worded by the page from the same rule as a row).
 * Restoring brings the courses hidden with the medrese back too; the page is
 * read again, and the banner gives way to "Medreseyi gizle".
 */
export function RestoreMadrasah({
  madrasahId,
  madrasahName,
  lockedNote,
}: {
  madrasahId: string;
  madrasahName: string;
  /** set when the caller may not bring it back: why, in a sentence */
  lockedNote: string | null;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const restore = () => {
    setBusy(true);
    startTransition(async () => {
      const result = await restoreMedrese(madrasahId);
      if (result.success) {
        notify({
          tone: "success",
          title: t("Archive.hidden.restored"),
          description: t("Archive.hidden.restoredBody", {
            name: madrasahName,
          }),
        });
        router.refresh();
      } else {
        notify({
          tone: "error",
          title: t("Archive.hidden.failedTitle"),
          description: words(madrasahRestoreErrorKey(result.code)),
        });
        // The page may be stale (someone else restored it, or a higher level hid it again).
        router.refresh();
      }
      setBusy(false);
    });
  };

  return (
    <section data-testid="madrasah-hidden" aria-labelledby="hidden-heading">
      <Alert tone="warning" title={t("Archive.hidden.title")}>
        <p>{t("Archive.hidden.body", { name: madrasahName })}</p>
        {lockedNote === null ? (
          <Button
            variant="outline"
            size="small"
            iconLeft={<Icon name="undo" size="sm" />}
            loading={busy || pending}
            aria-label={t("Archive.hidden.restoreLabel", {
              name: madrasahName,
            })}
            onClick={restore}
          >
            {t("Archive.hidden.restore")}
          </Button>
        ) : (
          <p className="mds-caption" data-testid="restore-note">
            {lockedNote}
          </p>
        )}
      </Alert>
    </section>
  );
}
