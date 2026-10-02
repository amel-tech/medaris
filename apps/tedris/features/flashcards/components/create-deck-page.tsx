"use client";

import type { FlashcardType } from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { createDeck } from "../actions";
import { attempt } from "../attempt";
import {
  DESCRIPTION_MAX,
  MAX_TAG_LENGTH,
  MAX_TAGS,
  parseTags,
  TITLE_MAX,
  TITLE_MIN,
  tagsProblem,
  titleProblem,
} from "../deck-model";
import { CardFace } from "./card-face";

/** The example cards' Arabic fronts: the same words in every language, so not messages. */
const SAMPLE_FRONT = {
  VOCABULARY: "دَعَا يَدْعُو دُعَاءً",
  HADEETH: "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ",
} as const;

/**
 * Deste oluştur (design tedris/27): a name, an optional description, the card
 * type (no default: the choice is the author's), optional tags, and a preview
 * of the card the chosen type makes. The deck is created private, with no
 * visibility choice on the form; asking for it to be published is the deck
 * page's. Nothing is sent while a field is invalid; a refusal from the API
 * keeps what was typed and says so in a toast.
 */
export function CreateDeckPage() {
  const t = useTranslations("tedris.Decks");
  const router = useRouter();
  const toaster = useToaster();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<FlashcardType | null>(null);
  const [tagsText, setTagsText] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);

  const tags = parseTags(tagsText);
  const problems = {
    title: titleProblem(title),
    kind: kind === null,
    tags: tagsProblem(tags),
  };
  const invalid =
    problems.title !== null || problems.kind || problems.tags !== null;

  const titleError = !attempted
    ? undefined
    : problems.title === "required"
      ? t("nameRequired")
      : problems.title === "tooShort"
        ? t("nameTooShort", { min: TITLE_MIN })
        : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (invalid || kind === null) return;
    setBusy(true);
    const result = await attempt(() =>
      createDeck({
        title,
        description,
        cardType: kind,
        tags,
      })
    );
    if (result.success) {
      router.push(`/decks/${result.data.id}`);
      return;
    }
    setBusy(false);
    toaster.notify({
      tone: "error",
      title: t("createFailedTitle"),
      description: t("tryAgainKept"),
    });
  };

  const sample = kind ?? "VOCABULARY";
  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <div className="flex flex-col gap-3">
        <Breadcrumb
          label={t("breadcrumbLabel")}
          items={[{ label: t("title"), href: "/decks" }, t("create")]}
        />
        <h1 className="mds-h1">{t("create")}</h1>
        <p className="mds-body-sm max-inline-measure">{t("createSubtitle")}</p>
      </div>

      <div className="grid items-start gap-8 grid-cols-[minmax(0,1fr)_var(--layout-aside)] max-md:grid-cols-1">
        <form
          className="flex flex-col gap-6"
          noValidate
          onSubmit={submit}
          aria-label={t("create")}
        >
          <p className="mds-caption">{t("required")}</p>
          <Field
            label={t("nameLabel")}
            help={t("nameHelp")}
            error={titleError}
            required
          >
            <Input
              name="title"
              value={title}
              maxLength={TITLE_MAX}
              autoComplete="off"
              required
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label={t("descriptionLabel")} help={t("descriptionHelp")}>
            <Textarea
              name="description"
              rows={3}
              maxLength={DESCRIPTION_MAX}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <div className="flex flex-col gap-2">
            <RadioGroup
              legend={
                <>
                  {t("kindLegend")}
                  <span className="mds-required" aria-hidden="true">
                    *
                  </span>
                </>
              }
              name="cardType"
              bordered
              required
              value={kind}
              onChange={(value) => setKind(value as FlashcardType)}
              options={[
                {
                  value: "VOCABULARY",
                  label: t("cardTypeVOCABULARY"),
                  description: t("kindVOCABULARYDesc"),
                },
                {
                  value: "HADEETH",
                  label: t("cardTypeHADEETH"),
                  description: t("kindHADEETHDesc"),
                },
              ]}
            />
            {attempted && problems.kind ? (
              <p className="mds-error" role="alert">
                {t("kindRequired")}
              </p>
            ) : null}
          </div>
          <Field
            label={t("tagsLabel")}
            help={t("tagsHelp")}
            error={
              attempted && problems.tags === "tooMany"
                ? t("tagsTooMany", { max: MAX_TAGS })
                : attempted && problems.tags === "tooLong"
                  ? t("tagsTooLong", { max: MAX_TAG_LENGTH })
                  : undefined
            }
          >
            <Input
              name="tags"
              value={tagsText}
              autoComplete="off"
              onChange={(event) => setTagsText(event.target.value)}
            />
          </Field>
          <Alert tone="neutral" title={t("noticeTitle")}>
            {t("noticeText")}
          </Alert>
          <div className="flex flex-wrap justify-end gap-3">
            <Button href="/decks" variant="ghost">
              {t("cancel")}
            </Button>
            <Button type="submit" loading={busy}>
              {t("submit")}
            </Button>
          </div>
        </form>

        <aside
          className="mds-card flex flex-col gap-4"
          aria-labelledby="deck-preview-title"
        >
          <h2 className="mds-h3" id="deck-preview-title">
            {sample === "HADEETH"
              ? t("previewHADEETH")
              : t("previewVOCABULARY")}
          </h2>
          <div className="flex flex-col gap-1">
            <p className="mds-eyebrow">{t("frontLabel")}</p>
            <CardFace text={SAMPLE_FRONT[sample]} size="sample" />
          </div>
          <hr className="mds-separator" />
          <div className="flex flex-col gap-1">
            <p className="mds-eyebrow">{t("backLabel")}</p>
            <p className="mds-body-sm" dir="auto">
              {sample === "HADEETH"
                ? t("sampleBackHADEETH")
                : t("sampleBackVOCABULARY")}
            </p>
          </div>
          <p className="mds-caption">{t("previewNote")}</p>
        </aside>
      </div>
    </main>
  );
}
