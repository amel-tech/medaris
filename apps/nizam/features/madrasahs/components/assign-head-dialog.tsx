"use client";

import type { HeadDelegationResponse } from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { ChoiceChips } from "@medaris/ui/mds/choice-chips";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  type DismissAnswer,
  endError,
  endOfDayIso,
  formatDay,
} from "../../permissions/present";
import { getHeadDelegations, setHeadMuderris } from "../actions";
import {
  groupByPerson,
  handOnCourseSuffix,
  handOnPlace,
  madrasahErrorKey,
  type PersonHandOn,
  type PickedUser,
  personDecisions,
  personsReady,
} from "../present";
import { HeadPicker } from "./head-picker";

export interface AssignTarget {
  id: string;
  name: string;
  /** the sitting başmüderris, if there is one: "Başmüderrisi değiştir" instead of "Başmüderris ata" */
  headId?: string | null;
  headName?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: AssignTarget | null;
  /** called once the appointment is saved */
  onAssigned?: () => void;
}

type Message = (
  key: string,
  values?: Record<string, string | number>
) => string;

/**
 * "Başmüderrisi değiştir" and "Başmüderris ata" (nizam 22, 07): the e-mail
 * search of "Medrese aç", an optional "Görev bitişi" and, when a başmüderris
 * is replaced, one "Devral" or "Düşür" for each role and permission they
 * handed on — none is chosen for the başnazım, and "Değiştir" stays off until
 * every row has an answer (_kurallar 14, 15). Without a sitting başmüderris
 * there is nothing to ask. The scrim does not close it.
 */
export function AssignHeadDialog({
  open,
  onOpenChange,
  target,
  onAssigned,
}: Props) {
  const tm = useTranslations("nizam.AssignHeadDialog");
  const t = tm as unknown as Message;
  const tp = useTranslations("nizam.MadrasahsPage");
  const tc = useTranslations("nizam.PermissionCatalog");
  const tr = useTranslations("nizam.Shell.roles");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";

  const changing = Boolean(target?.headId);
  const [head, setHead] = useState<PickedUser | null>(null);
  const [endDay, setEndDay] = useState("");
  const [items, setItems] = useState<
    HeadDelegationResponse[] | "failed" | null
  >(null);
  const [answers, setAnswers] = useState<
    Record<string, DismissAnswer | undefined>
  >({});
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const targetId = target?.id;

  const load = useCallback(async () => {
    if (!targetId) return;
    setItems(null);
    const result = await getHeadDelegations(targetId);
    setItems(result.success ? result.data : "failed");
  }, [targetId]);

  // Every opening starts clean and, when somebody is replaced, asks again
  // what they handed on: it may have changed since the table was read.
  useEffect(() => {
    if (!open) return;
    setHead(null);
    setEndDay("");
    setAnswers({});
    setSaving(false);
    setNow(new Date());
    setItems(changing ? null : []);
    if (changing) void load();
  }, [open, changing, load]);

  // Every row is asked about, what the incoming başmüderris was given too:
  // the API refuses a change that leaves one unanswered.
  const list = Array.isArray(items) ? items : [];
  const same = head !== null && head.id === target?.headId;
  const problem = endError(endDay, { now, timeZone, assignmentEnd: null });
  const people = groupByPerson(list);
  const answered =
    !changing || (Array.isArray(items) && personsReady(people, answers));
  const ready = head !== null && !same && problem === null && answered;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!target || !head || !ready) return;
    setSaving(true);
    const endIso = endDay ? endOfDayIso(endDay, timeZone) : null;
    const result = await setHeadMuderris(target.id, head.id, {
      ...(endIso ? { endsAt: new Date(endIso) } : {}),
      ...(changing ? { delegations: personDecisions(people, answers) } : {}),
    });
    setSaving(false);
    if (!result.success) {
      toast.error(t(changing ? "changeFailed" : "failed"), {
        description: tp(madrasahErrorKey(result.errorBody) as never),
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
    toast.success(t(changing ? "changed" : "saved"), {
      description: t(changing ? "changedBody" : "savedBody", {
        name: target.name,
        head: head.name,
      }),
    });
    onAssigned?.();
    onOpenChange(false);
  };

  const permissionName = (item: HeadDelegationResponse): string => {
    const code = item.permission ?? "";
    const key = code.replace(/\./g, "_");
    return tc.has(`permissions.${key}.short` as never)
      ? tc(`permissions.${key}.short` as never)
      : code;
  };

  const list_ = (names: string[]) => {
    try {
      return new Intl.ListFormat(locale, {
        style: "long",
        type: "conjunction",
      }).format(names);
    } catch {
      return names.join(", ");
    }
  };

  const roleName = (role: string): string =>
    role && tr.has(role as never) ? tr(role as never) : role;
  const firstOf = (group: PersonHandOn) =>
    group.items.find((i) => i.kind === "ROLE") ?? group.items[0];

  // The line under the person: the role with its scope and dates, the way
  // the table of nizam/22 reads it.
  const heading = (group: PersonHandOn): string => {
    const item = firstOf(group);
    if (!item) return "";
    const role = item.kind === "ROLE" ? (item.role ?? "") : "";
    return [
      roleName(role),
      item.kind === "ROLE"
        ? handOnPlace(item, target?.name ?? "")
        : (target?.name ?? ""),
      item.expiresAt
        ? t("untilDate", { date: formatDay(item.expiresAt, locale, timeZone) })
        : t("noEnd"),
      t("givenOn", { date: formatDay(item.grantedAt, locale, timeZone) }),
    ]
      .filter(Boolean)
      .join(" · ");
  };

  // "Ders açma ve kadro ile Yasak ve itiraz grupları; ayrıca 3 izin: …"
  const summary = (group: PersonHandOn): string => {
    // Every seat after the one the heading names: a müderris named in a
    // course is as much the başmüderris's gift as a nazır seat.
    const first = firstOf(group);
    const seats = group.items
      .filter((i) => i.kind === "ROLE" && i !== first)
      .map((i) =>
        [roleName(i.role ?? ""), handOnPlace(i, target?.name ?? "")]
          .filter(Boolean)
          .join(" · ")
      );
    const groups = group.items
      .filter((i) => i.kind !== "ROLE" && !i.permission)
      .map((i) => `${i.groupName ?? ""}${handOnCourseSuffix(i)}`);
    const perms = group.items
      .filter((i) => i.kind !== "ROLE" && i.permission)
      .map((i) => `${permissionName(i)}${handOnCourseSuffix(i)}`);
    const parts: string[] = seats.length > 0 ? [seats.join("; ")] : [];
    if (groups.length > 0) {
      parts.push(
        t("groupsSummary", { names: list_(groups), count: groups.length })
      );
    }
    if (perms.length > 0) {
      const text = t("permissionsSummary", {
        names: perms.join(" · "),
        count: perms.length,
      });
      parts.push(groups.length > 0 ? t("alsoSummary", { text }) : text);
    }
    return parts.join("; ");
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
      eyebrow={target?.name}
      title={changing ? t("titleChange") : t("title")}
      closeLabel={t("close")}
      footerMeta={changing && list.length > 0 ? t("answersNeeded") : undefined}
      footer={
        <>
          <DialogClose>{t("cancel")}</DialogClose>
          <Button type="submit" loading={saving} disabled={!ready}>
            {changing ? t("submitChange") : t("submit")}
          </Button>
        </>
      }
    >
      {changing ? (
        <p>
          <strong>{target?.headName ?? t("unknownPerson")}</strong>
          {t("introChange")}
        </p>
      ) : (
        <p>{t("intro", { name: target?.name ?? "" })}</p>
      )}
      <p className="mds-caption">{t("requiredNote")}</p>
      <HeadPicker
        value={head}
        onChange={setHead}
        disabled={saving}
        label={changing ? t("newHeadLabel") : undefined}
        chosenNote={t(changing ? "chosenNoteChange" : "chosenNote")}
        error={same ? t("sameHead") : undefined}
      />
      <Field
        label={t("endLabel")}
        help={t("endHelp")}
        error={problem ? t("endPast") : undefined}
      >
        <Input
          type="date"
          name="endDay"
          value={endDay}
          disabled={saving}
          onChange={(event) => setEndDay(event.target.value)}
        />
      </Field>

      {changing ? (
        <section
          aria-labelledby="delegations-heading"
          className="flex flex-col gap-3 border-t border-[var(--border-neutral-subtle)] pt-4"
          data-testid="delegations"
        >
          {items === null ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              <Skeleton height="3rem" />
              <Skeleton height="3rem" />
            </div>
          ) : items === "failed" ? (
            <Alert tone="error" title={t("loadFailedTitle")}>
              <p>{t("loadFailed")}</p>
              <Button
                variant="outline"
                size="small"
                onClick={() => void load()}
              >
                {t("retry")}
              </Button>
            </Alert>
          ) : list.length === 0 ? (
            <p className="mds-caption" id="delegations-heading">
              {t("nothingHandedOn", { head: target?.headName ?? "" })}
            </p>
          ) : (
            <>
              <h3 id="delegations-heading" className="mds-label">
                <strong>{target?.headName ?? t("unknownPerson")}</strong>
                {t("handedOnHeading")}
              </h3>
              <ul className="flex flex-col gap-3">
                {people.map((group) => {
                  const key = group.person.id;
                  const person = group.person.name ?? group.person.email ?? "";
                  const more = summary(group);
                  return (
                    <li
                      key={key}
                      className="flex flex-wrap items-center gap-3"
                      data-testid="delegation"
                    >
                      <Avatar name={person} decorative />
                      <span className="flex min-w-0 grow flex-col">
                        <bdi className="font-semibold">
                          {group.person.name ?? t("unknownPerson")}
                        </bdi>
                        {group.person.email ? (
                          <bdi dir="ltr" className="mds-caption font-mono">
                            {group.person.email}
                          </bdi>
                        ) : null}
                        <span className="mds-caption">{heading(group)}</span>
                        {more ? (
                          <span className="mds-caption">{more}</span>
                        ) : null}
                      </span>
                      <ChoiceChips
                        legend={t("personLegend", { person })}
                        value={answers[key] ?? null}
                        onChange={(v) =>
                          setAnswers((a) => ({
                            ...a,
                            [key]: (v ?? undefined) as
                              | DismissAnswer
                              | undefined,
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
              <p className="mds-caption">{t("answersNote")}</p>
            </>
          )}
        </section>
      ) : null}
    </Dialog>
  );
}
