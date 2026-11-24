"use client";

import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { useToaster } from "@medaris/ui/mds/toast";
import { findTerms } from "@medaris/utils";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { deleteTerm } from "../actions";
import type { TermFact } from "../glossary";
import { TermDialog } from "./term-dialog";

/**
 * A course's glossary as its müderris keeps it: every term, searched as it is
 * typed, with "Terim ekle" and each term's "Düzenle" and "Sil". The talebe
 * reads the same list on the course page in tedris-web.
 */
export function GlossaryScreen({
  courseId,
  terms,
}: {
  courseId: string;
  terms: TermFact[];
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const locale = useLocale();
  const router = useRouter();
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<
    null | { kind: "new" } | { kind: "edit"; term: TermFact }
  >(null);
  const [removing, setRemoving] = useState<TermFact | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const found = findTerms(terms, query, locale);

  const remove = (term: TermFact) => {
    setRemoving(null);
    setFailure(null);
    startTransition(async () => {
      const outcome = await deleteTerm(courseId, term.id);
      if (handleUnauthenticated(outcome)) return;
      if (!outcome.success) {
        setFailure(words("Glossary.failed"));
        return;
      }
      notify({ tone: "success", title: words("Glossary.removed") });
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-inline-0 flex-1 max-inline-[24rem]">
          <Field label={words("Glossary.search")}>
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </Field>
        </div>
        <Button onClick={() => setDialog({ kind: "new" })}>
          {words("Glossary.add")}
        </Button>
      </div>
      {failure ? <p className="mds-body-sm">{failure}</p> : null}
      <output className="mds-caption">
        {words("Glossary.count", { found: found.length, all: terms.length })}
      </output>
      {terms.length === 0 ? (
        <EmptyState>
          <p className="mds-h3">{words("Glossary.emptyTitle")}</p>
          <p>{words("Glossary.emptyBody")}</p>
        </EmptyState>
      ) : found.length === 0 ? (
        <EmptyState>{words("Glossary.noneFound")}</EmptyState>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-neutral-subtle p-0">
          {found.map((term) => (
            <li
              key={term.id}
              className="flex flex-wrap items-start justify-between gap-3 py-4"
            >
              <div className="flex min-inline-0 flex-1 flex-col gap-2">
                <p className="flex flex-wrap items-baseline gap-3">
                  <span className="mds-h4">{term.term}</span>
                  {term.arabic ? (
                    <span className="mds-arabic" lang="ar" dir="rtl">
                      {term.arabic}
                    </span>
                  ) : null}
                </p>
                <dl className="m-0 flex flex-col gap-1">
                  {(
                    [
                      ["lexicalMeaning", term.lexicalMeaning],
                      ["technicalMeaning", term.technicalMeaning],
                      ["example", term.example],
                    ] as const
                  ).map(([key, text]) =>
                    text ? (
                      <div key={key} className="flex flex-wrap gap-2">
                        <dt className="mds-caption min-inline-[8rem] text-neutral-muted">
                          {words(`Glossary.${key}`)}
                        </dt>
                        <dd
                          className="mds-body-sm m-0 min-inline-0 flex-1 whitespace-pre-line"
                          dir="auto"
                        >
                          {text}
                        </dd>
                      </div>
                    ) : null
                  )}
                </dl>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="small"
                  disabled={pending}
                  aria-label={words("Glossary.editLabel", { term: term.term })}
                  onClick={() => setDialog({ kind: "edit", term })}
                >
                  {words("Glossary.edit")}
                </Button>
                <Button
                  variant="ghost"
                  size="small"
                  disabled={pending}
                  aria-label={words("Glossary.removeLabel", {
                    term: term.term,
                  })}
                  onClick={() => setRemoving(term)}
                >
                  {words("Glossary.remove")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === "new" ? (
        <TermDialog courseId={courseId} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "edit" ? (
        <TermDialog
          courseId={courseId}
          term={dialog.term}
          onClose={() => setDialog(null)}
        />
      ) : null}
      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={words("Glossary.removeTitle")}
        confirmLabel={words("Glossary.removeYes")}
        confirmVariant="destructive"
        onConfirm={() => removing && remove(removing)}
      >
        {words("Glossary.removeConfirm", { term: removing?.term ?? "" })}
      </AlertDialog>
    </>
  );
}
