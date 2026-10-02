"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { type ImportRowError, importRowErrors } from "../deck-model";

/**
 * "İçe aktar" (design tedris/29): a CSV or Excel file of cards into the deck.
 * The file goes to the app's own `/api/decks/:id/import`, which hands it to
 * tedrisat with the caller's token. A file with bad rows adds nothing and the
 * dialog lists the rows and what is wrong with each, so the file can be fixed
 * and sent again.
 */
export function ImportCardsDialog({
  deckId,
  onClose,
}: {
  deckId: string;
  onClose: () => void;
}) {
  const t = useTranslations("tedris.Decks");
  const router = useRouter();
  const toaster = useToaster();
  const [file, setFile] = useState<File | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rowErrors, setRowErrors] = useState<ImportRowError[]>([]);
  const [failed, setFailed] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (!file) return;
    setBusy(true);
    setRowErrors([]);
    setFailed(false);
    const body = new FormData();
    body.set("file", file);
    try {
      const response = await fetch(`/api/decks/${deckId}/import`, {
        method: "POST",
        body,
      });
      if (response.ok) {
        const { count } = (await response.json()) as { count: number };
        toaster.notify({
          tone: "success",
          title: t("importedTitle"),
          description: t("importedText", { count }),
        });
        router.refresh();
        onClose();
        return;
      }
      const rows =
        response.status === 422
          ? importRowErrors(await response.json().catch(() => null))
          : [];
      if (rows.length > 0) setRowErrors(rows);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      form
      onSubmit={submit}
      size="md"
      title={t("importTitle")}
      footer={
        <>
          <DialogClose>{t("cancel")}</DialogClose>
          <Button type="submit" loading={busy}>
            {t("import")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field
          label={t("importFile")}
          help={t("importHelp")}
          error={attempted && !file ? t("importNoFile") : undefined}
          required
        >
          <Input
            type="file"
            name="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </Field>
        <p className="mds-body-sm">
          {t("importSample")}:{" "}
          <a href="/api/decks/sample?format=xlsx" download>
            Excel (.xlsx)
          </a>
          <span className="mds-sep" aria-hidden="true">
            ·
          </span>
          <a href="/api/decks/sample?format=csv" download>
            CSV (.csv)
          </a>
        </p>
        {rowErrors.length > 0 ? (
          <Alert
            tone="error"
            title={t("importRowErrors", { count: rowErrors.length })}
          >
            <ul className="mds-body-sm">
              {rowErrors.map((entry) => (
                <li key={entry.row}>
                  <strong>{t("importRow", { row: entry.row })}</strong>
                  {entry.messages.length > 0
                    ? `: ${entry.messages.join("; ")}`
                    : null}
                </li>
              ))}
            </ul>
          </Alert>
        ) : null}
        {failed ? (
          <Alert tone="error" title={t("importFailedTitle")}>
            {t("tryAgain")}
          </Alert>
        ) : null}
      </div>
    </Dialog>
  );
}
