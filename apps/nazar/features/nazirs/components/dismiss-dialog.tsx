"use client";

import type { MadrasahNazirGivenResponse } from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { ChoiceChips } from "@medaris/ui/mds/choice-chips";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { useToaster } from "@medaris/ui/mds/toast";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { dayFormat } from "~/lib/dates";
import type { Messages } from "~/lib/i18n/messages";
import { dismissNazir, getNazirGrants } from "../actions";
import {
  type Answer,
  type Answers,
  awaitingGrants,
  dismissDecisions,
  dismissReady,
  dropSummary,
  givenRoleLine,
  type NazirRow,
  nazirErrorKey,
  permissionsLine,
  personName,
} from "../nazirs";

/**
 * "Görevden al" (nazir 15, _kurallar 15): a Dialog with a Form. What the nazır
 * handed on to others is listed, one row per person, with "Devral" and
 * "Düşür"; none is chosen for the başmüderris, and the button stays off until
 * every row has an answer. "Vazgeç" has the focus and the scrim does not close
 * it. With nothing handed on there is nothing to ask and the button is ready.
 * Every opening asks the API again: what was handed on may have changed. The
 * API refuses a set of answers that is not exactly the people it lists, so a
 * list that moved under the başmüderris is read again and the answers cleared.
 *
 * "Düzenle" beside a row (a link to nazir 06) is not drawn: the design leaves
 * open whether it opens a second window or replaces this one, and most of the
 * people listed are not nazırs of the medrese, whom the permission editor
 * cannot open.
 */
export function DismissDialog({
  madrasahId,
  madrasahName,
  nazir,
  locale,
  timeZone,
  onClose,
  onDone,
}: {
  madrasahId: string;
  madrasahName: string;
  /** the nazır being dismissed; null while the dialog is shut */
  nazir: NazirRow | null;
  locale: string;
  timeZone: string;
  onClose: () => void;
  /** called once the nazır is gone, for the page to read the roster again */
  onDone: () => void;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [given, setGiven] = useState<
    MadrasahNazirGivenResponse[] | "failed" | null
  >(null);
  const [answers, setAnswers] = useState<Answers>({});
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const day = useMemo(() => dayFormat(locale, timeZone), [locale, timeZone]);
  const userId = nazir?.id;

  // Only the latest ask may answer: a nazır opened after another must not see the first one's list.
  const asked = useRef(0);

  const load = useCallback(async () => {
    if (!userId) return;
    const ask = ++asked.current;
    setGiven(null);
    const result = await getNazirGrants(madrasahId, userId);
    if (ask === asked.current) {
      setGiven(result.success ? result.data : "failed");
    }
  }, [madrasahId, userId]);

  useEffect(() => {
    setAnswers({});
    if (userId) void load();
    else setGiven(null);
  }, [userId, load]);

  const list = Array.isArray(given) ? given : [];
  const ready = Array.isArray(given) && dismissReady(list, answers);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nazir || !ready || pending) return;
    startTransition(async () => {
      const result = await dismissNazir(
        madrasahId,
        nazir.id,
        dismissDecisions(list, answers)
      );
      if (result.success) {
        notify({
          tone: "success",
          title: t("Dismiss.dismissed"),
          description: t("Dismiss.dismissedBody", { name: nazir.name }),
        });
        onClose();
        onDone();
        return;
      }
      notify({
        tone: "error",
        title: t("Dismiss.failedTitle"),
        description: words(nazirErrorKey(result.code)),
      });
      if (result.code === "DISMISS_DECISIONS_INCOMPLETE") {
        setAnswers({});
        void load();
      } else if (result.code === "MADRASAH_NAZIR_NOT_FOUND") {
        onClose();
        onDone();
      }
    });
  };

  return (
    <Dialog
      open={nazir !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      form
      size="md"
      onSubmit={submit}
      eyebrow={madrasahName}
      title={t("Dismiss.title", { name: nazir?.name ?? "" })}
      closeLabel={t("Shell.close")}
      initialFocus={cancelRef}
      footerMeta={list.length > 0 ? t("Dismiss.gateNote") : undefined}
      footer={
        <>
          <DialogClose ref={cancelRef}>{t("Dismiss.cancel")}</DialogClose>
          <Button type="submit" loading={pending} disabled={!ready}>
            {t("Dismiss.submit")}
          </Button>
        </>
      }
    >
      {given === null ? (
        <output className="flex flex-col gap-3" aria-busy="true">
          <span className="mds-visually-hidden">{t("Shell.loadingLabel")}</span>
          <Skeleton height="3rem" />
          <Skeleton height="3rem" />
        </output>
      ) : given === "failed" ? (
        <Alert tone="error" title={t("Dismiss.loadFailedTitle")}>
          <p>{t("Dismiss.loadFailed")}</p>
          <Button variant="outline" size="small" onClick={() => void load()}>
            {t("Shell.retry")}
          </Button>
        </Alert>
      ) : (
        <>
          <p>
            {t(list.length > 0 ? "Dismiss.intro" : "Dismiss.introNone", {
              name: nazir?.name ?? "",
            })}
          </p>
          {list.length > 0 ? (
            <>
              <ul
                className="mds-card flex flex-col p-0"
                data-testid="given-people"
              >
                {list.map((row) => {
                  const name = personName(row.user, t("Nazirs.unknownPerson"));
                  const held = {
                    groups: row.groups,
                    permissions: row.permissions,
                  };
                  const extra = permissionsLine(held, words);
                  return (
                    <li
                      key={row.user.id}
                      className="flex flex-wrap items-center gap-3 px-card py-3 border-be border-neutral-subtle last:border-be-0"
                      data-testid="given-person"
                    >
                      <Avatar name={name} decorative />
                      <span className="flex min-inline-0 grow basis-[14rem] flex-col gap-1">
                        <bdi className="font-semibold">{name}</bdi>
                        {row.user.email ? (
                          <bdi
                            dir="ltr"
                            className="mds-caption break-all font-mono"
                          >
                            {row.user.email}
                          </bdi>
                        ) : null}
                        {row.roles.map((role) => (
                          <span
                            key={`${role.role}:${role.scopeName}:${role.grantedAt}`}
                            className="mds-caption"
                          >
                            <bdi>{givenRoleLine(role, words, day)}</bdi>
                          </span>
                        ))}
                        {row.groups.length > 0 ? (
                          <span className="flex flex-wrap gap-2">
                            {row.groups.map((group) => (
                              <Badge key={group.id} variant="secondary">
                                <bdi>{group.name}</bdi>
                              </Badge>
                            ))}
                          </span>
                        ) : null}
                        {extra ? (
                          <span className="mds-caption">{extra}</span>
                        ) : null}
                        {awaitingGrants(held) &&
                        row.roles.some((r) => r.role === "MEDRESE_NAZIR") ? (
                          <span className="mds-caption">
                            {t("Dismiss.noPermissions")}
                          </span>
                        ) : null}
                      </span>
                      <ChoiceChips
                        legend={t("Dismiss.answerLegend", { person: name })}
                        value={answers[row.user.id] ?? null}
                        onChange={(value) =>
                          setAnswers((current) => ({
                            ...current,
                            [row.user.id]: (value ?? undefined) as
                              | Answer
                              | undefined,
                          }))
                        }
                        options={[
                          { value: "TAKE_OVER", label: t("Dismiss.takeOver") },
                          { value: "DROP", label: t("Dismiss.drop") },
                        ]}
                      />
                    </li>
                  );
                })}
              </ul>
              <p className="mds-caption">{t("Dismiss.answersNote")}</p>
            </>
          ) : null}
          {nazir ? (
            <Alert>
              <p>{dropSummary(nazir, words, locale)}</p>
            </Alert>
          ) : null}
        </>
      )}
    </Dialog>
  );
}
