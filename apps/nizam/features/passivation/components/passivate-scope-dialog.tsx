"use client";

import type {
  PassivationImpactResponse,
  PassivationScopeType,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  deactivateKosk,
  previewKoskDeactivation,
} from "../../kosks/admin-actions";
import {
  deactivateMadrasah,
  previewMadrasahDeactivation,
} from "../../madrasahs/actions";
import {
  canConfirm,
  changedImpact,
  hiddenCourseCount,
  impactLines,
  type PassivationState,
  passivationErrorKey,
} from "../present";

interface Props {
  kind: PassivationScopeType;
  id: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** called once the scope is passive */
  onPassivated?: () => void;
}

/**
 * "Köşkü pasife al" and "Medreseyi pasife al" (nizam 20 and 07, MDRS-227): a
 * Dialog, not an AlertDialog (canvas rule 11: a decision with consequences to
 * read first). On opening it asks the API what passivating takes along and
 * shows it as a warning; the button posts the token that preview gave, so what
 * the person confirms is exactly what they read. When something changed in
 * between, the API answers with the fresh numbers: they replace the old ones,
 * the screen says so, and nothing is retried by itself. "Vazgeç" has the
 * focus; the scrim does not close it.
 */
export function PassivateScopeDialog({
  kind,
  id,
  name,
  open,
  onOpenChange,
  onPassivated,
}: Props) {
  const t = useTranslations("nizam.PassivateScopeDialog");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const [state, setState] = useState<PassivationState>({ kind: "loading" });
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const result = await (kind === "KOSK"
      ? previewKoskDeactivation(id)
      : previewMadrasahDeactivation(id));
    setState(
      result.success
        ? { kind: "ready", impact: result.data, changed: false, saving: false }
        : { kind: "failed" }
    );
  }, [kind, id]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const confirm = async () => {
    if (state.kind !== "ready") return;
    const { impact } = state;
    setState({ ...state, saving: true });
    const result = await (kind === "KOSK"
      ? deactivateKosk(id, impact.confirmation)
      : deactivateMadrasah(id, impact.confirmation));
    if (result.success) {
      toast.success(t(kind === "KOSK" ? "doneKosk" : "doneMadrasah"), {
        description: t(kind === "KOSK" ? "doneKoskBody" : "doneMadrasahBody", {
          name,
        }),
      });
      onOpenChange(false);
      onPassivated?.();
      return;
    }
    const fresh = changedImpact(result.errorBody);
    if (fresh) {
      setState({ kind: "ready", impact: fresh, changed: true, saving: false });
      return;
    }
    setState({ ...state, saving: false });
    toast.error(t("failed"), {
      description: t(passivationErrorKey(result.errorBody) as never),
      duration: Number.POSITIVE_INFINITY,
    });
  };

  const when = (at: Date) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(new Date(at));

  const renderImpact = (
    impact: PassivationImpactResponse,
    changed: boolean
  ) => {
    if (impact.alreadyPassive) {
      return <Alert tone="info" title={t("errors.alreadyPassive")} />;
    }
    const more = hiddenCourseCount(impact);
    return (
      <>
        {changed ? <Alert tone="info" title={t("changed")} /> : null}
        <Alert tone="warning" title={t("warningTitle")}>
          <ul className="flex list-disc flex-col gap-1 ps-5">
            {impactLines(impact, kind).map((line) => (
              <li key={line.key}>{t(line.key, line.values)}</li>
            ))}
          </ul>
        </Alert>
        {impact.closesContent && impact.students.enrolled > 0 ? (
          <p className="mds-caption">{t("studentsNote")}</p>
        ) : null}
        {impact.closesContent && impact.courses.items.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {impact.courses.items.map((c) => (
              <li key={c.id}>
                <bdi>
                  {t("courseItem", {
                    title: c.title,
                    kosk: c.koskName,
                    enrolled: c.enrolled,
                  })}
                </bdi>
              </li>
            ))}
            {more > 0 ? (
              <li className="mds-caption">
                {t("moreCourses", { count: more })}
              </li>
            ) : null}
          </ul>
        ) : null}
        {impact.closesContent && impact.sessions.next.length > 0 ? (
          <ul className="mds-caption flex flex-col gap-1">
            {impact.sessions.next.map((s) => (
              <li key={s.id}>
                <bdi>
                  {t("sessionItem", {
                    title: s.title,
                    course: s.courseTitle,
                    when: when(s.scheduledAt),
                  })}
                </bdi>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mds-caption">
          {t(kind === "KOSK" ? "wayKosk" : "wayMadrasah")}
        </p>
      </>
    );
  };

  const saving = state.kind === "ready" && state.saving;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
      eyebrow={name}
      title={t(kind === "KOSK" ? "titleKosk" : "titleMadrasah")}
      closeLabel={t("close")}
      size="md"
      dismissible={false}
      initialFocus={cancelRef}
      footer={
        <>
          <DialogClose ref={cancelRef}>{t("cancel")}</DialogClose>
          <Button
            type="button"
            loading={saving}
            disabled={!canConfirm(state)}
            onClick={() => void confirm()}
          >
            {t("confirm")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" aria-busy={state.kind === "loading"}>
        {state.kind === "loading" ? <p>{t("loading")}</p> : null}
        {state.kind === "failed" ? (
          <Alert tone="error" title={t("loadFailed")}>
            <Button variant="outline" size="small" onClick={() => void load()}>
              {t("retry")}
            </Button>
          </Alert>
        ) : null}
        {state.kind === "ready"
          ? renderImpact(state.impact, state.changed)
          : null}
      </div>
    </Dialog>
  );
}
