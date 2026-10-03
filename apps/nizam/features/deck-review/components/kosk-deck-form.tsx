"use client";

import type {
  DeckProposalResponse,
  FlashcardType,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useRouter } from "next/navigation";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { type FormEvent, useRef, useState } from "react";
import { openKoskDeck } from "../actions";
import {
  CARD_TYPES,
  DESCRIPTION_MAX,
  type DeckFormValues,
  deckFailureKey,
  deckPayload,
  emptyDeckForm,
  formFromProposal,
  previewKey,
  shortDate,
  TITLE_MAX,
  validateDeckForm,
} from "../present";

interface Props {
  koskId: string;
  koskName: string;
  /** the talebe the deck is open to, from the köşk's `studentCount` */
  studentCount: number;
  /** the proposal the deck is opened from; null for a deck from scratch */
  proposal: DeckProposalResponse | null;
}

/**
 * Köşk destesi aç (nizam 35): a name, a description and what the cards are.
 * Opened from a proposal it arrives filled in and the proposal is accepted
 * with the deck; the cards are added afterwards in the card table. The side
 * panel shows how a card of the chosen type looks.
 */
export function KoskDeckForm({
  koskId,
  koskName,
  studentCount,
  proposal,
}: Props) {
  const t = useTranslations("nizam.KoskDeckForm");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const router = useRouter();
  const base = `/${locale}/kosks/${koskId}`;

  const [values, setValues] = useState<DeckFormValues>(
    proposal ? formFromProposal(proposal) : emptyDeckForm()
  );
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement | null>(null);

  const titleError =
    touched && validateDeckForm(values) ? t("titleRequired") : undefined;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (validateDeckForm(values)) {
      setTouched(true);
      titleRef.current?.focus();
      return;
    }
    setSaving(true);
    const result = await openKoskDeck(
      koskId,
      deckPayload(values, proposal?.id)
    );
    setSaving(false);
    if (!result.success) {
      toast.error(t("failed"), {
        description: t(deckFailureKey(result.errorBody) as never),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    toast.success(t("opened"), {
      description: t("openedBody", { title: values.title.trim() }),
    });
    router.push(`${base}/desteler`);
    router.refresh();
  };

  const preview = previewKey(values.cardType);

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="kosk-deck-form"
    >
      <header className="flex max-w-[48rem] flex-col gap-3">
        <Breadcrumb
          label={t("breadcrumbLabel")}
          items={[
            { label: t("breadcrumbRoot"), href: `${base}/desteler` },
            t("breadcrumbCurrent"),
          ]}
        />
        <h1 className="mds-h1">{t("title")}</h1>
        <p>{t("intro", { kosk: koskName })}</p>
      </header>

      <div className="grid gap-section lg:grid-cols-[1fr_22rem]">
        <form
          onSubmit={submit}
          noValidate
          className="flex max-w-[42rem] flex-col gap-5"
        >
          <p className="mds-caption">* {t("requiredNote")}</p>

          {proposal ? (
            <Alert tone="neutral" title={t("proposalTitle")}>
              <span data-testid="proposal-banner">
                {t.rich("proposalBody", {
                  title: proposal.title,
                  name: proposal.proposedBy.name ?? t("unknownPerson"),
                  course: proposal.courseTitle ?? "",
                  date: shortDate(proposal.createdAt, { locale, timeZone }),
                  b: (chunks) => <strong>{chunks}</strong>,
                })}
              </span>
            </Alert>
          ) : null}

          <Field
            label={t("nameLabel")}
            required
            help={t("nameHelp", { kosk: koskName })}
            error={titleError}
          >
            <Input
              {...({ ref: titleRef } as object)}
              name="title"
              value={values.title}
              maxLength={TITLE_MAX}
              required
              onChange={(e) =>
                setValues((v) => ({ ...v, title: e.target.value }))
              }
              onBlur={() => setTouched(true)}
            />
          </Field>

          <Field label={t("descriptionLabel")} help={t("descriptionHelp")}>
            <Textarea
              name="description"
              value={values.description}
              maxLength={DESCRIPTION_MAX}
              rows={4}
              onChange={(e) =>
                setValues((v) => ({ ...v, description: e.target.value }))
              }
            />
          </Field>

          <RadioGroup
            legend={t("typeLabel")}
            name="cardType"
            required
            bordered
            value={values.cardType}
            onChange={(next) =>
              setValues((v) => ({ ...v, cardType: next as FlashcardType }))
            }
            options={CARD_TYPES.map((type) => ({
              value: type,
              label: t(`types.${type}.label`),
              description: t(`types.${type}.description`),
              icon: (
                <Icon name={type === "HADEETH" ? "book" : "globe"} size="sm" />
              ),
            }))}
          />

          <Alert tone="neutral" title={t("visibleTitle")}>
            {t("visibleBody", { kosk: koskName, count: studentCount })}
          </Alert>

          <div className="flex justify-end gap-3">
            <Button variant="ghost" href={`${base}/desteler`} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button type="submit" loading={saving}>
              {t("submit")}
            </Button>
          </div>
        </form>

        <aside
          className="flex flex-col gap-4 self-start rounded-surface border border-neutral-subtle p-5"
          aria-labelledby="later-heading"
        >
          <h2 id="later-heading" className="mds-h3">
            {t("laterTitle")}
          </h2>
          <p>{t("laterBody")}</p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {(["csv", "xls"] as const).map((kind) => (
              <li key={kind} className="flex items-start gap-3">
                <Icon name={kind === "csv" ? "fileCsv" : "fileXls"} size="md" />
                <span className="flex flex-col">
                  <span>{t(`import.${kind}.title`)}</span>
                  <span className="mds-caption">
                    {t(`import.${kind}.body`)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div data-testid="card-preview" className="flex flex-col gap-2">
            <span className="mds-eyebrow">{t("previewFront")}</span>
            <bdi className="mds-reading" dir="auto">
              {t(`preview.${preview}.front`)}
            </bdi>
            <span className="mds-eyebrow">{t("previewBack")}</span>
            <bdi dir="auto">{t(`preview.${preview}.back`)}</bdi>
          </div>
          <p className="mds-caption">{t(`preview.${preview}.note`)}</p>
        </aside>
      </div>
    </div>
  );
}
