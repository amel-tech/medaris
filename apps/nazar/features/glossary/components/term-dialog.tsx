"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { createTerm, updateTerm } from "../actions";
import {
  newTermDraft,
  type TermDraft,
  type TermFact,
  type TermField,
  termBody,
  termDraftOf,
  termLimit,
  termProblems,
} from "../glossary";

/**
 * "Terim ekle" and "Terimi düzenle": the term, its Arabic spelling (set RTL),
 * its meaning in the language, its meaning as a term, and an example. Only the
 * term is required.
 */
export function TermDialog({
  courseId,
  term,
  onClose,
}: {
  courseId: string;
  /** the term being edited; absent for a new one */
  term?: TermFact;
  onClose: () => void;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<TermDraft>(() =>
    term ? termDraftOf(term) : newTermDraft()
  );
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const problems = termProblems(draft);

  const error = (field: TermField): string | undefined => {
    if (!sent) return undefined;
    const problem = problems[field];
    if (problem === "required") return words("Glossary.required");
    if (problem === "length")
      return words("Glossary.tooLong", { max: termLimit(field) });
    return undefined;
  };
  const set = (field: TermField) => (value: string) =>
    setDraft((was) => ({ ...was, [field]: value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setSent(true);
    setFailure(null);
    if (Object.keys(problems).length > 0) return;
    const body = termBody(draft);
    startTransition(async () => {
      const outcome = term
        ? await updateTerm(courseId, term.id, body)
        : await createTerm(courseId, body);
      if (handleUnauthenticated(outcome)) return;
      if (!outcome.success) {
        setFailure(
          words(
            outcome.code === "COURSE_TERMS_FULL"
              ? "Glossary.full"
              : "Glossary.failed"
          )
        );
        return;
      }
      notify({
        tone: "success",
        title: words(term ? "Glossary.saved" : "Glossary.added"),
      });
      onClose();
      router.refresh();
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
      title={words(term ? "Glossary.editTitle" : "Glossary.addTitle")}
      footer={
        <>
          <DialogClose>{words("Glossary.cancel")}</DialogClose>
          <Button type="submit" loading={pending}>
            {words("Glossary.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label={words("Glossary.term")} error={error("term")} required>
          <Input
            name="term"
            value={draft.term}
            onChange={(event) => set("term")(event.target.value)}
          />
        </Field>
        <Field label={words("Glossary.arabic")} error={error("arabic")}>
          <Input
            name="arabic"
            lang="ar"
            dir="rtl"
            className="font-arabic text-[length:var(--fs-arabic-min)]"
            value={draft.arabic}
            onChange={(event) => set("arabic")(event.target.value)}
          />
        </Field>
        <Field
          label={words("Glossary.lexicalMeaning")}
          help={words("Glossary.lexicalMeaningHelp")}
          error={error("lexicalMeaning")}
        >
          <Textarea
            name="lexicalMeaning"
            value={draft.lexicalMeaning}
            onChange={(event) => set("lexicalMeaning")(event.target.value)}
          />
        </Field>
        <Field
          label={words("Glossary.technicalMeaning")}
          help={words("Glossary.technicalMeaningHelp")}
          error={error("technicalMeaning")}
        >
          <Textarea
            name="technicalMeaning"
            value={draft.technicalMeaning}
            onChange={(event) => set("technicalMeaning")(event.target.value)}
          />
        </Field>
        <Field label={words("Glossary.example")} error={error("example")}>
          <Textarea
            name="example"
            dir="auto"
            value={draft.example}
            onChange={(event) => set("example")(event.target.value)}
          />
        </Field>
        {failure ? <Alert tone="error">{failure}</Alert> : null}
      </div>
    </Dialog>
  );
}
