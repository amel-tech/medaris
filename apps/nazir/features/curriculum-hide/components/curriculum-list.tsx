"use client";

import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { hideSession, hideWeek } from "../actions";
import { hideErrorKey, type WeekRow } from "../curriculum";

type Target =
  | { kind: "week"; id: string; title: string; sessions: number }
  | { kind: "session"; id: string; title: string };

/**
 * The weeks of a course and the sessions in them, each with "Gizle" (MDRS-143).
 * Hiding is not destructive (nothing is deleted and the Arşiv brings it back),
 * so the answer is an AlertDialog whose focus starts on "Vazgeç" and whose
 * action is a primary "Gizle" (_kurallar 11, 13), as "Medreseyi gizle" is. The
 * API decides by `week.hide`: a refusal is a toast and nothing changes. A week
 * or session that is already gone is what the person wanted, so the page is
 * read again and says so.
 */
export function CurriculumList({
  courseId,
  weeks,
}: {
  courseId: string;
  weeks: WeekRow[];
}) {
  const t = useTranslations("nazir");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<Target | null>(null);

  const confirm = () => {
    if (!target) return;
    startTransition(async () => {
      const result =
        target.kind === "week"
          ? await hideWeek(courseId, target.id)
          : await hideSession(target.id);
      if (result.success) {
        notify({
          title: t(`Curriculum.${target.kind}.done`),
          description: t(`Curriculum.${target.kind}.doneBody`, {
            title: target.title,
          }),
        });
        router.refresh();
      } else {
        notify({
          tone: result.code.endsWith("_NOT_FOUND") ? "info" : "error",
          title: t(`Curriculum.${target.kind}.failedTitle`),
          description: words(hideErrorKey(result.code)),
        });
        if (result.code.endsWith("_NOT_FOUND")) router.refresh();
      }
      setTarget(null);
    });
  };

  if (weeks.length === 0) {
    return <EmptyState>{t("Curriculum.empty")}</EmptyState>;
  }

  return (
    <>
      <ol className="flex flex-col gap-4" data-testid="curriculum">
        {weeks.map((week) => (
          <li key={week.id} className="mds-card flex flex-col gap-3 p-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col">
                <h2 className="mds-h3">
                  <bdi>
                    {t("Curriculum.weekLabel", { number: week.number })}
                    {": "}
                    {week.title}
                  </bdi>
                </h2>
                <span className="mds-caption">
                  {t("Curriculum.sessionCount", {
                    count: week.sessions.length,
                  })}
                </span>
              </div>
              <Button
                variant="outline"
                size="small"
                iconLeft={<Icon name="eyeOff" size="sm" />}
                aria-label={t("Curriculum.hideWeekLabel", {
                  title: week.title,
                })}
                onClick={() =>
                  setTarget({
                    kind: "week",
                    id: week.id,
                    title: week.title,
                    sessions: week.sessions.length,
                  })
                }
              >
                {t("Curriculum.hideWeek")}
              </Button>
            </div>
            {week.sessions.length === 0 ? (
              <p className="mds-caption">{t("Curriculum.noSessions")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--border-neutral-subtle)]">
                {week.sessions.map((session) => (
                  <li
                    key={session.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-2"
                  >
                    <span className="flex min-inline-0 flex-col">
                      <bdi className="font-semibold">{session.title}</bdi>
                      {session.when ? (
                        <span className="mds-caption">{session.when}</span>
                      ) : null}
                    </span>
                    <Button
                      variant="outline"
                      size="small"
                      iconLeft={<Icon name="eyeOff" size="sm" />}
                      aria-label={t("Curriculum.hideSessionLabel", {
                        title: session.title,
                      })}
                      onClick={() =>
                        setTarget({
                          kind: "session",
                          id: session.id,
                          title: session.title,
                        })
                      }
                    >
                      {t("Curriculum.hideSession")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      <AlertDialog
        open={target !== null}
        onOpenChange={(next) => {
          if (!pending && !next) setTarget(null);
        }}
        eyebrow={target?.title ?? ""}
        title={target ? t(`Curriculum.${target.kind}.title`) : ""}
        confirmLabel={t("Curriculum.confirm")}
        cancelLabel={t("Curriculum.cancel")}
        closeLabel={t("Shell.close")}
        confirmLoading={pending}
        onConfirm={confirm}
      >
        {target ? (
          <p>
            {target.kind === "week"
              ? t("Curriculum.week.body", {
                  title: target.title,
                  count: target.sessions,
                })
              : t("Curriculum.session.body", { title: target.title })}
          </p>
        ) : null}
      </AlertDialog>
    </>
  );
}
