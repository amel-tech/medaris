"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { Select } from "@medaris/ui/mds/select";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { importCards } from "../actions";
import { type ImportRowProblem, importFileProblem } from "../decks";

/**
 * "Excel'den aktar": a .xlsx or .csv file of cards into one deck, chosen here.
 * The file goes to tedrisat with the caller's token; a file with bad rows adds
 * nothing, and the dialog lists the rows so the file can be fixed and sent
 * again. The sample template is a download from this app's own route.
 */
export function ImportCardsDialog({
  decks,
  deckId: fixedDeckId,
  onClose,
}: {
  decks: { id: string; title: string }[];
  /** the deck the file goes to, when the page already is one */
  deckId?: string;
  onClose: () => void;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [deckId, setDeckId] = useState<string | null>(
    fixedDeckId ?? decks[0]?.id ?? null
  );
  const [file, setFile] = useState<File | null>(null);
  const [fileProblem, setFileProblem] = useState<"type" | "size" | null>(null);
  const [sent, setSent] = useState(false);
  const [rows, setRows] = useState<ImportRowProblem[]>([]);
  const [failed, setFailed] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setSent(true);
    setRows([]);
    setFailed(false);
    if (!file || !deckId || fileProblem) return;
    const body = new FormData();
    body.set("file", file);
    startTransition(async () => {
      const outcome = await importCards(deckId, body);
      if (handleUnauthenticated(outcome)) return;
      if (outcome.success) {
        notify({
          tone: "success",
          title: words("Decks.importDone", { count: outcome.data.count }),
        });
        router.refresh();
        onClose();
        return;
      }
      if (outcome.rows.length > 0) setRows(outcome.rows);
      else setFailed(true);
    });
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
      title={words("Decks.importTitle")}
      footer={
        <>
          <DialogClose>{words("Decks.cancel")}</DialogClose>
          <Button type="submit" loading={pending}>
            {words("Decks.import")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {fixedDeckId === undefined ? (
          <Field label={words("Decks.importDeck")} required>
            <Select
              name="deckId"
              value={deckId}
              options={decks.map((deck) => ({
                value: deck.id,
                label: deck.title,
              }))}
              onChange={setDeckId}
            />
          </Field>
        ) : null}
        <Field
          label={words("Decks.importFile")}
          help={words("Decks.importHelp")}
          error={
            sent && !file
              ? words("Decks.importNoFile")
              : fileProblem === "type"
                ? words("Decks.importType")
                : fileProblem === "size"
                  ? words("Decks.importSize")
                  : undefined
          }
          required
        >
          <Input
            type="file"
            name="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              setFile(next);
              setFileProblem(next ? importFileProblem(next) : null);
            }}
          />
        </Field>
        <p className="mds-body-sm">
          {words("Decks.importSample")}:{" "}
          <a href="/api/decks/sample?format=xlsx" download>
            {words("Decks.importSampleXlsx")}
          </a>
          {" · "}
          <a href="/api/decks/sample?format=csv" download>
            {words("Decks.importSampleCsv")}
          </a>
        </p>
        {rows.length > 0 ? (
          <Alert
            tone="error"
            title={words("Decks.importRowErrors", { count: rows.length })}
          >
            <ul className="mds-body-sm">
              {rows.map((entry) => (
                <li key={entry.row}>
                  <strong>
                    {words("Decks.importRow", { row: entry.row })}
                  </strong>
                  {entry.messages.length > 0
                    ? `: ${entry.messages.join("; ")}`
                    : null}
                </li>
              ))}
            </ul>
          </Alert>
        ) : null}
        {failed ? <Alert tone="error">{words("Decks.failed")}</Alert> : null}
      </div>
    </Dialog>
  );
}
