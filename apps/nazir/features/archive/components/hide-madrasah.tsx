"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { hideMedrese, restoreMedrese } from "../actions";
import { archiveErrorKey, madrasahRestoreErrorKey } from "../archive";

/**
 * "Medreseyi gizle" (nazir 12): the section under the list and its question.
 * Hiding is not destructive (nothing is deleted), so the answer is an
 * AlertDialog whose focus starts on "Vazgeç" and whose action is a primary
 * "Gizle" (_kurallar 11, 13). It says what the design's own sentence leaves out:
 * a hidden medrese is brought back by the level that hid it or one above
 * (MDRS-135: the başmüderris who hid it, or Medaris yönetimi), and until then the
 * courses in the Arşiv cannot be brought back. Once it is done the section says
 * so where the button was, with "Medreseyi geri getir" beside it: what every
 * sentence here promises is on the page. A medrese that was hidden already
 * (MADRASAH_ALREADY_HIDDEN) was hidden by someone else, perhaps Medaris
 * yönetimi, so the section says it is hidden and offers no button the API
 * could answer with 403 (MDRS-108). Should the API still refuse a restore
 * (ARCHIVE_RESTORE_LEVEL), the toast says why.
 */
export function HideMadrasah({
  madrasahId,
  madrasahName,
}: {
  madrasahId: string;
  madrasahName: string;
}) {
  const t = useTranslations("nazir");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  // "mine": hidden by this click, so "Medreseyi geri getir" is offered;
  // "already": hidden by someone else before it, so it is not.
  const [hidden, setHidden] = useState<"mine" | "already" | null>(null);
  const [restoring, startRestore] = useTransition();

  const hide = () =>
    startTransition(async () => {
      const result = await hideMedrese(madrasahId);
      if (result.success || result.code === "MADRASAH_ALREADY_HIDDEN") {
        setOpen(false);
        setHidden(result.success ? "mine" : "already");
        notify({
          tone: result.success ? "success" : "info",
          title: t("Archive.hide.done"),
          description: result.success
            ? t("Archive.hide.doneBody", { name: madrasahName })
            : t("Archive.hide.already"),
        });
        router.refresh();
        return;
      }
      setOpen(false);
      notify({
        tone: "error",
        title: t("Archive.hide.failedTitle"),
        description: words(archiveErrorKey(result.code)),
      });
    });

  const restore = () =>
    startRestore(async () => {
      const result = await restoreMedrese(madrasahId);
      if (result.success || result.code === "MADRASAH_NOT_HIDDEN") {
        setHidden(null);
        notify({
          tone: "success",
          title: t("Archive.hide.restored"),
          description: t("Archive.hide.restoredBody", { name: madrasahName }),
        });
        router.refresh();
        return;
      }
      notify({
        tone: "error",
        title: t("Archive.hide.restoreFailedTitle"),
        description: words(madrasahRestoreErrorKey(result.code)),
      });
    });

  return (
    <section
      aria-labelledby="hide-heading"
      className="flex flex-col gap-4"
      data-testid="hide-madrasah"
    >
      <h2 className="mds-h2" id="hide-heading">
        {t("Archive.hide.title")}
      </h2>
      <div className="mds-card flex flex-wrap items-center justify-between gap-4 p-card">
        {hidden ? (
          <>
            <Alert tone="warning" title={t("Archive.hide.done")}>
              <p>
                {hidden === "mine"
                  ? t("Archive.hide.doneBody", { name: madrasahName })
                  : t("Archive.hide.already")}
              </p>
            </Alert>
            {hidden === "mine" ? (
              <Button
                variant="outline"
                iconLeft={<Icon name="undo" size="sm" />}
                loading={restoring}
                onClick={restore}
              >
                {t("Archive.hide.restore")}
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <p className="max-inline-measure">
              {t("Archive.hide.text", { name: madrasahName })}
            </p>
            <Button
              variant="outline"
              iconLeft={<Icon name="eyeOff" size="sm" />}
              onClick={() => setOpen(true)}
            >
              {t("Archive.hide.button")}
            </Button>
          </>
        )}
      </div>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
        eyebrow={madrasahName}
        title={t("Archive.hide.title")}
        confirmLabel={t("Archive.hide.confirm")}
        cancelLabel={t("Archive.hide.cancel")}
        closeLabel={t("Shell.close")}
        confirmLoading={pending}
        onConfirm={hide}
      >
        <p>{t("Archive.hide.confirmBody", { name: madrasahName })}</p>
      </AlertDialog>
    </section>
  );
}
