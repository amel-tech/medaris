"use client";

import type {
  GivenItemResponse,
  MedarisNazimResponse,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { ChoiceChips } from "@medaris/ui/mds/choice-chips";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { dismissNazim, getGivenItems } from "../actions";
import {
  type DismissAnswer,
  decisionItems,
  dismissDecisions,
  dismissReady,
  givenKey,
  groupItems,
  type Messages,
  permissionErrorKey,
} from "../present";

/** The Shell's role names, for the two roles it spells differently. */
const ROLE_KEY: Record<string, string> = {
  MEDARIS_NAZIM: "medaris",
  KOSK_NAZIM: "kosk",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nazim: MedarisNazimResponse | null;
  /** called once the person is dismissed */
  onDismissed?: () => void;
}

/**
 * "Görevden al" (nizam 11, _kurallar 15): a Dialog with a Form. What the
 * person handed on to others is listed, one row each, with "Devral" and
 * "Düşür"; none is chosen for the başnazım, and the button stays off until
 * every row has an answer. "Vazgeç" has the focus. The scrim does not close
 * it. With nothing handed on there is nothing to ask.
 */
export function DismissDialog({
  open,
  onOpenChange,
  nazim,
  onDismissed,
}: Props) {
  const tm = useTranslations("nizam.DismissDialog");
  const t = tm as unknown as Messages;
  const tp = useTranslations("nizam.PermissionsPage");
  const tc = useTranslations("nizam.PermissionCatalog");
  const tr = useTranslations("nizam.Shell.roles");
  const [items, setItems] = useState<GivenItemResponse[] | "failed" | null>(
    null
  );
  const [answers, setAnswers] = useState<
    Record<string, DismissAnswer | undefined>
  >({});
  const [saving, setSaving] = useState(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const userId = nazim?.user.id;

  const load = useCallback(async () => {
    if (!userId) return;
    setItems(null);
    const result = await getGivenItems(userId);
    setItems(result.success ? result.data : "failed");
  }, [userId]);

  // Every opening asks again: what the person handed on may have changed.
  useEffect(() => {
    if (!open) return;
    setAnswers({});
    setSaving(false);
    void load();
  }, [open, load]);

  const list = Array.isArray(items) ? decisionItems(items) : [];
  const groups = Array.isArray(items) ? groupItems(items) : [];
  const ready = Array.isArray(items) && dismissReady(list, answers);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nazim || !ready) return;
    setSaving(true);
    const result = await dismissNazim(
      nazim.user.id,
      dismissDecisions(list, answers)
    );
    setSaving(false);
    if (!result.success) {
      toast.error(t("failed"), {
        description: tp(permissionErrorKey(result.errorBody) as never),
        duration: Number.POSITIVE_INFINITY,
      });
      // The list moved under the başnazım: ask again.
      if (
        result.errorBody &&
        (result.errorBody as { code?: string }).code ===
          "DISMISS_DECISIONS_INCOMPLETE"
      ) {
        setAnswers({});
        void load();
      }
      return;
    }
    toast.success(t("dismissed"), {
      description: t("dismissedBody", { name: nazim.user.name ?? "" }),
    });
    onDismissed?.();
    onOpenChange(false);
  };

  const what = (item: GivenItemResponse): string => {
    if (item.kind === "GROUP") return item.groupName ?? "";
    if (item.kind === "ROLE") {
      const role = ROLE_KEY[item.role ?? ""] ?? item.role ?? "";
      return tr.has(role as never) ? tr(role as never) : role;
    }
    if (item.permission) {
      const key = item.permission.replace(/\./g, "_");
      return tc.has(`course.${key}` as never)
        ? tc(`course.${key}` as never)
        : tc.has(`permissions.${key}.title` as never)
          ? tc(`permissions.${key}.title` as never)
          : item.permission;
    }
    return item.groupName ?? "";
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
      form
      size="md"
      onSubmit={submit}
      eyebrow={nazim?.user.name ?? undefined}
      title={t("title")}
      closeLabel={t("close")}
      initialFocus={cancelRef}
      footerMeta={t("auditNote")}
      footer={
        <>
          <DialogClose ref={cancelRef}>{t("cancel")}</DialogClose>
          <Button type="submit" loading={saving} disabled={!ready}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <p>{t("intro", { name: nazim?.user.name ?? "" })}</p>
      {items === null ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton height="3rem" />
          <Skeleton height="3rem" />
        </div>
      ) : items === "failed" ? (
        <Alert tone="error" title={t("loadFailedTitle")}>
          <p>{t("loadFailed")}</p>
          <Button variant="outline" size="small" onClick={() => void load()}>
            {t("retry")}
          </Button>
        </Alert>
      ) : list.length === 0 && groups.length === 0 ? (
        <p className="mds-caption">{t("nothingHandedOn")}</p>
      ) : (
        <>
          <p>{t("question", { count: list.length })}</p>
          <ul
            className="mds-card flex flex-col divide-y divide-[var(--border-neutral-subtle)] p-0"
            data-testid="given-items"
          >
            {list.map((item) => {
              const key = givenKey(item);
              const person = item.to?.name ?? item.to?.email ?? "";
              return (
                <li
                  key={key}
                  className="flex flex-wrap items-center gap-3 px-card py-3"
                  data-testid="given-item"
                >
                  <span className="flex min-w-0 grow flex-col">
                    <bdi className="font-semibold">{what(item)}</bdi>
                    <bdi className="mds-caption">
                      {item.scopeName
                        ? t("itemLineScoped", {
                            person,
                            scope: item.scopeName,
                          })
                        : t("itemLine", { person })}
                    </bdi>
                  </span>
                  <ChoiceChips
                    legend={t("answerLegend", {
                      what: what(item),
                      person,
                    })}
                    value={answers[key] ?? null}
                    onChange={(v) =>
                      setAnswers((a) => ({
                        ...a,
                        [key]: (v ?? undefined) as DismissAnswer | undefined,
                      }))
                    }
                    options={[
                      { value: "TAKE_OVER", label: t("takeOver") },
                      { value: "DROP", label: t("drop") },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
          {list.length > 0 ? (
            <p className="mds-caption">{t("answersNote")}</p>
          ) : null}
          {groups.length > 0 ? (
            <section className="flex flex-col gap-2" data-testid="given-groups">
              <p>{t("groupsQuestion", { count: groups.length })}</p>
              <ul className="mds-card flex flex-col divide-y divide-[var(--border-neutral-subtle)] p-0">
                {groups.map((group) => (
                  <li
                    key={givenKey(group)}
                    className="flex flex-col px-card py-3"
                    data-testid="given-group"
                  >
                    <bdi className="font-semibold">{group.groupName}</bdi>
                    <bdi className="mds-caption">
                      {group.scopeName
                        ? t("groupLineScoped", {
                            action: t(`groupAction.${group.groupAction}`),
                            scope: group.scopeName,
                          })
                        : t("groupLine", {
                            action: t(`groupAction.${group.groupAction}`),
                          })}
                    </bdi>
                  </li>
                ))}
              </ul>
              <p className="mds-caption">{t("groupsNote")}</p>
            </section>
          ) : null}
        </>
      )}
    </Dialog>
  );
}
