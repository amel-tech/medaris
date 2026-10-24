"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Checkbox } from "@medaris/ui/mds/checkbox";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { Select } from "@medaris/ui/mds/select";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { createCards } from "../actions";
import { type CardType, deckErrorKey, FACE_MAX, FACE_MIN } from "../decks";
import {
  BAB_KEYS,
  BABS,
  type BabKey,
  generateSigas,
  readRoot,
  type SigaDraft,
  type SigaKip,
  type SigaMeta,
  sigaDraftProblems,
} from "../siga";

/** A draft's sîga as the preview names it: "Gâib · müfred", "Mütekellim · vahde". */
const sigaLabel = (words: Messages, meta: SigaMeta): string => {
  const row =
    meta.sahis === "mutekellim"
      ? "mutekellim"
      : meta.sahis === "gaib"
        ? meta.cinsiyet === "muennes"
          ? "gaibe"
          : "gaib"
        : meta.cinsiyet === "muennes"
          ? "muhataba"
          : "muhatab";
  const number =
    meta.sahis === "mutekellim"
      ? meta.sayi === "mufred"
        ? "vahde"
        : "maalgayr"
      : meta.sayi;
  return `${words(`Decks.siga.${row}`)} · ${words(`Decks.siga.${number}`)}`;
};

/**
 * "Sîga üret": the müderris types a root and picks its bâb and tenses, then
 * sees every sîga as a draft card (`generateSigas`), corrects the vowels or
 * the meaning where needed, and saves them all through the endpoint "Kart
 * ekle" uses. Each card keeps its sîga in `contentMeta`, so tedris-web can lay
 * the deck out as a sîga table.
 */
export function SigaGeneratorDialog({
  deckId,
  cardType,
  onClose,
}: {
  deckId: string;
  cardType: CardType;
  onClose: () => void;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [root, setRoot] = useState("");
  const [bab, setBab] = useState<BabKey>("nasara");
  const [kips, setKips] = useState<SigaKip[]>(["mazi", "muzari"]);
  const [maziMeaning, setMaziMeaning] = useState("");
  const [muzariMeaning, setMuzariMeaning] = useState("");
  const [drafts, setDrafts] = useState<SigaDraft[] | null>(null);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const kipsErrorId = useId();

  const rootRead = readRoot(root);
  const rootProblem = "problem" in rootRead ? rootRead.problem : null;
  const kipsMissing = sent && kips.length === 0;
  const draftProblems = drafts ? sigaDraftProblems(drafts) : [];
  const lengthError = (index: number, face: string): string | undefined => {
    if (!sent || !draftProblems.includes(index)) return undefined;
    const length = face.trim().length;
    return length < FACE_MIN || length > FACE_MAX
      ? words("Decks.lengthError", { min: FACE_MIN, max: FACE_MAX })
      : undefined;
  };

  const toggleKip = (kip: SigaKip, on: boolean) =>
    setKips((was) =>
      on ? [...new Set([...was, kip])] : was.filter((k) => k !== kip)
    );

  const preview = () => {
    setSent(true);
    if (rootProblem || kips.length === 0) return;
    setDrafts(
      generateSigas({ root, bab, kips, maziMeaning, muzariMeaning }) ?? []
    );
    setSent(false);
  };

  const save = () => {
    if (!drafts || pending) return;
    setSent(true);
    setFailure(null);
    if (draftProblems.length > 0) return;
    startTransition(async () => {
      const outcome = await createCards(
        deckId,
        drafts.map((draft) => ({
          type: cardType,
          contentFront: draft.contentFront.trim(),
          contentBack: draft.contentBack.trim(),
          contentMeta: draft.contentMeta,
        }))
      );
      if (handleUnauthenticated(outcome)) return;
      if (!outcome.success) {
        setFailure(words(`Decks.${deckErrorKey(outcome.code)}`));
        return;
      }
      notify({
        tone: "success",
        title: words("Decks.siga.saved", { count: outcome.data.count }),
      });
      onClose();
      router.refresh();
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (drafts) save();
    else preview();
  };

  const edit = (index: number, change: Partial<SigaDraft>) =>
    setDrafts((was) =>
      was ? was.map((d, i) => (i === index ? { ...d, ...change } : d)) : was
    );

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        // A save in flight finishes here: closing now would let its answer
        // close whatever the page opened next, or fail where nobody sees it.
        if (!next && !pending) onClose();
      }}
      dismissible={!pending}
      form
      onSubmit={submit}
      size="md"
      title={words("Decks.siga.title")}
      footer={
        drafts ? (
          <>
            <Button
              variant="outline"
              type="button"
              disabled={pending}
              onClick={() => {
                setDrafts(null);
                setSent(false);
                setFailure(null);
              }}
            >
              {words("Decks.siga.back")}
            </Button>
            <Button type="submit" loading={pending}>
              {words("Decks.siga.save", { count: drafts.length })}
            </Button>
          </>
        ) : (
          <>
            <DialogClose>{words("Decks.cancel")}</DialogClose>
            <Button type="submit">{words("Decks.siga.preview")}</Button>
          </>
        )
      }
    >
      {drafts ? (
        <div className="flex flex-col gap-5">
          <p className="mds-body-sm">{words("Decks.siga.previewHint")}</p>
          {(["mazi", "muzari"] as const)
            .filter((kip) => kips.includes(kip))
            .map((kip) => (
              <section key={kip} className="flex flex-col gap-3">
                <h3 className="mds-h4">
                  {words(
                    kip === "mazi"
                      ? "Decks.siga.kipMazi"
                      : "Decks.siga.kipMuzari"
                  )}
                </h3>
                <ol className="m-0 flex list-none flex-col gap-3 p-0">
                  {drafts.map((draft, index) =>
                    draft.contentMeta.kip === kip ? (
                      <li
                        key={`${kip}-${draft.contentMeta.sahis}-${draft.contentMeta.cinsiyet}-${draft.contentMeta.sayi}`}
                      >
                        {/* One sîga per group: its name labels both faces. The
                            legend floats, so it is a grid item like the rest
                            rather than a legend drawn on the border. */}
                        <fieldset className="m-0 grid min-inline-0 grid-cols-[9rem_minmax(0,1fr)_minmax(0,2fr)] items-start gap-3 border-0 p-0 max-md:grid-cols-1">
                          <legend className="mds-label float-start pbs-2 max-md:pbs-0">
                            {sigaLabel(words, draft.contentMeta)}
                          </legend>
                          <Field
                            label={words("Decks.siga.front")}
                            error={lengthError(index, draft.contentFront)}
                          >
                            <Input
                              lang="ar"
                              dir="rtl"
                              className="font-arabic text-[length:var(--fs-arabic-min)]"
                              value={draft.contentFront}
                              onChange={(event) =>
                                edit(index, {
                                  contentFront: event.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field
                            label={words("Decks.siga.meaning")}
                            error={lengthError(index, draft.contentBack)}
                          >
                            <Input
                              value={draft.contentBack}
                              onChange={(event) =>
                                edit(index, { contentBack: event.target.value })
                              }
                            />
                          </Field>
                        </fieldset>
                      </li>
                    ) : null
                  )}
                </ol>
              </section>
            ))}
          {failure ? <Alert tone="error">{failure}</Alert> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="mds-body-sm">{words("Decks.siga.scope")}</p>
          <Field
            label={words("Decks.siga.root")}
            help={words("Decks.siga.rootHelp")}
            error={
              sent && rootProblem
                ? words(
                    `Decks.siga.root${rootProblem[0].toUpperCase()}${rootProblem.slice(1)}`
                  )
                : undefined
            }
            required
          >
            <Input
              name="root"
              lang="ar"
              dir="rtl"
              className="font-arabic"
              autoComplete="off"
              value={root}
              onChange={(event) => setRoot(event.target.value)}
            />
          </Field>
          <Field
            label={words("Decks.siga.bab")}
            help={
              <span className="mds-arabic" lang="ar" dir="rtl">
                {BABS[bab].name}
              </span>
            }
            required
          >
            <Select
              options={BAB_KEYS.map((key) => ({
                value: key,
                label: BABS[key].latin,
              }))}
              value={bab}
              onChange={(value) => value && setBab(value as BabKey)}
            />
          </Field>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mds-label pbe-2">
              {words("Decks.siga.kips")}
            </legend>
            <Checkbox
              label={words("Decks.siga.kipCount", {
                kip: words("Decks.siga.kipMazi"),
              })}
              aria-invalid={kipsMissing || undefined}
              aria-describedby={kipsMissing ? kipsErrorId : undefined}
              checked={kips.includes("mazi")}
              onCheckedChange={(on) => toggleKip("mazi", on)}
            />
            <Checkbox
              label={words("Decks.siga.kipCount", {
                kip: words("Decks.siga.kipMuzari"),
              })}
              aria-invalid={kipsMissing || undefined}
              aria-describedby={kipsMissing ? kipsErrorId : undefined}
              checked={kips.includes("muzari")}
              onCheckedChange={(on) => toggleKip("muzari", on)}
            />
            {kipsMissing ? (
              <p className="mds-error" id={kipsErrorId}>
                {words("Decks.siga.kipsRequired")}
              </p>
            ) : null}
          </fieldset>
          {kips.includes("mazi") ? (
            <Field
              label={words("Decks.siga.maziMeaning")}
              help={words("Decks.siga.maziMeaningHelp")}
            >
              <Input
                name="maziMeaning"
                value={maziMeaning}
                onChange={(event) => setMaziMeaning(event.target.value)}
              />
            </Field>
          ) : null}
          {kips.includes("muzari") ? (
            <Field
              label={words("Decks.siga.muzariMeaning")}
              help={words("Decks.siga.muzariMeaningHelp")}
            >
              <Input
                name="muzariMeaning"
                value={muzariMeaning}
                onChange={(event) => setMuzariMeaning(event.target.value)}
              />
            </Field>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
