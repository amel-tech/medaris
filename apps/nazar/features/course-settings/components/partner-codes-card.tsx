"use client";

import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { addPartnerCode, removePartnerCode } from "../actions";
import {
  normalizePartnerCode,
  PARTNER_CODE_MAX,
  partnerCodeErrorKey,
  partnerCodeProblem,
} from "../partner-codes";

export interface PartnerCodesCardPartner {
  id: string;
  name: string;
  codes: string[];
}

/**
 * "Ortak uygulama kodları" of Ders ayarları (partner enrollments): for each
 * partner application of the course's köşk, the codes of its own that enrol
 * people in this course, a "Kaldır" beside each and a field to add one. Each
 * write is one call; a refusal is worded from its code under the field
 * (adding) or in a toast that stays (removing), and a code another course has
 * is "taken" without naming that course. The page reads itself again after a
 * write. The server page draws this only for a caller who holds
 * `course.partner_codes`, and only when the köşk has a partner.
 */
export function PartnerCodesCard({
  courseId,
  partners,
}: {
  courseId: string;
  partners: PartnerCodesCardPartner[];
}) {
  const t = useTranslations("nazar");
  return (
    <section
      aria-labelledby="partner-codes-heading"
      className="mds-card flex flex-col gap-4 p-card"
      data-testid="partner-codes"
    >
      <div className="flex flex-col gap-1">
        <h2 className="mds-h3" id="partner-codes-heading">
          {t("CourseSettings.partnerCodes.title")}
        </h2>
        <p className="mds-body-sm text-neutral-muted">
          {t("CourseSettings.partnerCodes.intro")}
        </p>
      </div>
      {partners.map((partner) => (
        <PartnerCodes key={partner.id} courseId={courseId} partner={partner} />
      ))}
    </section>
  );
}

function PartnerCodes({
  courseId,
  partner,
}: {
  courseId: string;
  partner: PartnerCodesCardPartner;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const busy = adding || removing !== null || refreshing;
  const fieldId = `partner-code-${partner.id}`;

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const code = normalizePartnerCode(typed);
    const problem = partnerCodeProblem(code);
    if (problem) {
      setError(t(`CourseSettings.partnerCodes.errors.${problem}`));
      return;
    }
    setAdding(true);
    const result = await addPartnerCode(courseId, partner.id, code);
    setAdding(false);
    if (handleUnauthenticated(result)) return;
    if (!result.success) {
      setError(words(partnerCodeErrorKey(result.code)));
      return;
    }
    setTyped("");
    setError(null);
    notify({
      title: t("CourseSettings.partnerCodes.added"),
      description: t("CourseSettings.partnerCodes.addedBody", {
        code,
        name: partner.name,
      }),
    });
    startRefresh(() => router.refresh());
  };

  const remove = async (code: string) => {
    if (busy) return;
    setRemoving(code);
    const result = await removePartnerCode(courseId, partner.id, code);
    setRemoving(null);
    if (handleUnauthenticated(result)) return;
    if (!result.success) {
      notify({
        tone: "error",
        title: t("CourseSettings.partnerCodes.removeFailed"),
        description: words(partnerCodeErrorKey(result.code)),
      });
      return;
    }
    notify({
      title: t("CourseSettings.partnerCodes.removed"),
      description: t("CourseSettings.partnerCodes.removedBody", {
        code,
        name: partner.name,
      }),
    });
    startRefresh(() => router.refresh());
  };

  return (
    <div
      className="flex flex-col gap-3 border-bs border-neutral-subtle pbs-4"
      data-testid={fieldId}
    >
      <h3 className="mds-label">{partner.name}</h3>
      {partner.codes.length === 0 ? (
        <p className="mds-body-sm">{t("CourseSettings.partnerCodes.empty")}</p>
      ) : (
        <ul
          className="m-0 flex list-none flex-col p-0"
          aria-label={t("CourseSettings.partnerCodes.listLabel", {
            name: partner.name,
          })}
        >
          {partner.codes.map((code) => (
            <li
              key={code}
              className="flex items-center justify-between gap-2 py-2 border-be border-neutral-subtle last:border-be-0"
            >
              <bdi dir="ltr" className="break-all font-mono">
                {code}
              </bdi>
              <Button
                variant="ghost"
                size="small"
                type="button"
                disabled={busy && removing !== code}
                loading={removing === code}
                iconLeft={<Icon name="trash" size="sm" />}
                onClick={() => remove(code)}
              >
                {t("CourseSettings.partnerCodes.remove")}
                <span className="mds-visually-hidden"> {code}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col items-start gap-2"
        onSubmit={add}
        noValidate
      >
        <Field
          className="self-stretch"
          label={t("CourseSettings.partnerCodes.codeLabel")}
          help={t("CourseSettings.partnerCodes.codeHelp")}
          error={error ?? undefined}
        >
          <Input
            id={fieldId}
            name="code"
            value={typed}
            maxLength={PARTNER_CODE_MAX}
            mono
            autoComplete="off"
            spellCheck={false}
            dir="ltr"
            disabled={busy}
            onChange={(event) => {
              setTyped(event.target.value);
              if (error) setError(null);
            }}
          />
        </Field>
        <Button
          type="submit"
          variant="secondary"
          loading={adding}
          disabled={busy && !adding}
        >
          {t("CourseSettings.partnerCodes.add")}
        </Button>
      </form>
    </div>
  );
}
