"use client";

import type {
  MedarisNazimResponse,
  PermissionCatalogResponse,
  PermissionGroupResponse,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { Select } from "@medaris/ui/mds/select";
import { isoToZonedLocal, isUnfinishedEnd, resolveEnd } from "@medaris/utils";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { PickedUser } from "../../madrasahs/present";
import { appointNazim, setNazimGrants } from "../actions";
import {
  extrasToSend,
  formatDay,
  formatMoment,
  type Messages,
  NO_GROUP,
  otherGroupsOf,
  permissionErrorKey,
  platformGroupOf,
  platformGroups,
  summaryCounts,
  toggleExtra,
  withoutGroupCodes,
} from "../present";
import { NazimPicker } from "./nazim-picker";
import { PermissionBoxes } from "./permission-boxes";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** the person whose permissions are edited; null appoints someone new */
  nazim: MedarisNazimResponse | null;
  catalog: PermissionCatalogResponse;
  groups: PermissionGroupResponse[];
  /** called once the permissions are saved */
  onSaved?: () => void;
}

/**
 * "İzinleri düzenle" and "Medaris nazımı ata" (nizam 12): a ready group, the
 * permissions one by one and an optional end (a date and a time), in a Dialog
 * with a Form.
 * Choosing a group ticks and locks what it carries; "Grup yok" unlocks. The
 * summary line counts the group's permissions and the ones ticked besides.
 * An end after the appointment's own end is refused where it is typed. The
 * scrim does not close it, so a stray click does not lose the boxes.
 */
export function PermissionsDialog({
  open,
  onOpenChange,
  nazim,
  catalog,
  groups,
  onSaved,
}: Props) {
  const tm = useTranslations("nizam.PermissionsDialog");
  const t = tm as unknown as Messages;
  const tp = useTranslations("nizam.PermissionsPage");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";

  const usable = useMemo(() => platformGroups(groups), [groups]);
  const [picked, setPicked] = useState<PickedUser | null>(null);
  const [groupId, setGroupId] = useState<string>(NO_GROUP);
  const [extras, setExtras] = useState<string[]>([]);
  const [end, setEnd] = useState("");
  const [unfinished, setUnfinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Every opening starts from what the person holds now (or from nothing).
  useEffect(() => {
    if (!open) return;
    const current = nazim ? platformGroupOf(nazim) : null;
    setPicked(null);
    setGroupId(
      current && usable.some((g) => g.id === current.id) ? current.id : NO_GROUP
    );
    setExtras(nazim ? nazim.permissions.map((p) => p.code) : []);
    setEnd(isoToZonedLocal(nazim?.expiresAt, timeZone));
    setUnfinished(false);
    setNow(new Date());
    setSaving(false);
  }, [open, nazim, usable, timeZone]);

  const group = usable.find((g) => g.id === groupId) ?? null;
  const groupCodes = useMemo(() => group?.permissions ?? [], [group]);
  const locked = useMemo(() => new Set(groupCodes), [groupCodes]);
  const ticked = useMemo(
    () => new Set(withoutGroupCodes(extras, groupCodes)),
    [extras, groupCodes]
  );
  const counts = summaryCounts(groupCodes, extras);

  const assignmentEnd = nazim?.assignmentExpiresAt ?? null;
  const { iso: endIso, problem } = resolveEnd({
    value: end,
    held: nazim?.expiresAt ?? null,
    timeZone,
    now,
    assignmentEnd,
    unfinished,
  });
  const grantedAt = useMemo(
    () =>
      Object.fromEntries(
        (nazim?.permissions ?? []).map((p) => [p.code, p.grantedAt])
      ),
    [nazim]
  );
  const extraHelp = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(grantedAt)
          .filter(([code]) => code === "platform.ban_account")
          .map(([code, at]) => [
            code,
            t("grantedAt", { moment: formatMoment(at, locale, timeZone) }),
          ])
      ),
    [grantedAt, locale, timeZone, t]
  );

  const canSave = (nazim !== null || picked !== null) && problem === null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // A half-typed picker reads "" and may never have been left, so it is read again here.
    if (isUnfinishedEnd(event.currentTarget.elements.namedItem("end"))) {
      setUnfinished(true);
      return;
    }
    if (!canSave) return;
    setSaving(true);
    const body = {
      groupId: group ? group.id : null,
      permissions: extrasToSend(catalog.platform, extras, groupCodes),
      expiresAt: endIso ? new Date(endIso) : null,
    };
    const result = nazim
      ? await setNazimGrants(nazim.user.id, body)
      : await appointNazim({ userId: (picked as PickedUser).id, ...body });
    setSaving(false);
    if (!result.success) {
      toast.error(t(nazim ? "failed" : "appointFailed"), {
        description: tp(permissionErrorKey(result.errorBody) as never),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    const name = nazim?.user.name ?? picked?.name ?? "";
    toast.success(t(nazim ? "saved" : "appointed"), {
      description: t(nazim ? "savedBody" : "appointedBody", { name }),
    });
    onSaved?.();
    onOpenChange(false);
  };

  const summary = group
    ? t("summaryGroup", {
        fromGroup: counts.fromGroup,
        extra: counts.extra,
      })
    : t("summaryPlain", { extra: counts.extra });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
      form
      size="md"
      onSubmit={submit}
      eyebrow={t("eyebrow")}
      title={nazim ? t("titleEdit") : t("titleAppoint")}
      closeLabel={t("close")}
      footerMeta={summary}
      footer={
        <>
          <DialogClose>{t("cancel")}</DialogClose>
          <Button type="submit" loading={saving} disabled={!canSave}>
            {t("save")}
          </Button>
        </>
      }
    >
      {nazim ? (
        <div className="flex items-center gap-3" data-testid="nazim-card">
          <Avatar
            name={nazim.user.name ?? nazim.user.email ?? ""}
            size="lg"
            decorative
          />
          <span className="flex min-w-0 flex-col">
            <bdi className="font-semibold">
              {nazim.user.name ?? t("unknownPerson")}
            </bdi>
            {nazim.user.email ? (
              <bdi dir="ltr" className="mds-caption font-mono">
                {nazim.user.email}
              </bdi>
            ) : null}
            <span className="mds-caption">
              {t("cardLine", {
                by: nazim.appointedBy?.name ?? t("unknownPerson"),
                date: formatDay(nazim.appointedAt, locale, timeZone),
              })}
            </span>
          </span>
        </div>
      ) : (
        <NazimPicker value={picked} onChange={setPicked} disabled={saving} />
      )}

      <div className="flex flex-col gap-2">
        <Field label={t("groupLabel")} help={t("groupHelp")}>
          <Select
            value={groupId}
            onChange={(v) => {
              const next = v ?? NO_GROUP;
              setGroupId(next);
              // What the new group carries is the group's now, not a single permission.
              const carried =
                usable.find((g) => g.id === next)?.permissions ?? [];
              setExtras((e) => withoutGroupCodes(e, carried));
            }}
            disabled={saving}
            options={[
              { value: NO_GROUP, label: t("noGroup") },
              ...usable.map((g) => ({ value: g.id, label: g.name })),
            ]}
          />
        </Field>
        <a className="mds-link self-start" href={`/${locale}/izin-gruplari`}>
          {t("editGroups")}
        </a>
        {nazim && otherGroupsOf(nazim).length > 0 ? (
          <p className="mds-caption" data-testid="course-group-note">
            {t("courseGroupNote", {
              groups: otherGroupsOf(nazim)
                .map((g) =>
                  g.scope === "ALL_COURSES"
                    ? t("groupEveryCourse", { name: g.name })
                    : t("groupOneCourse", {
                        name: g.name,
                        course: g.courseTitle ?? "",
                      })
                )
                .join(", "),
            })}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="mds-h3">{t("permissionsHeading")}</h3>
        <PermissionBoxes
          sections={catalog.platform}
          checked={ticked}
          locked={locked}
          onToggle={(code, on) => setExtras((e) => toggleExtra(e, code, on))}
          disabled={saving}
          extraHelp={extraHelp}
          lockedNote={t("fromGroup")}
        />
      </div>

      <Field
        label={t("endLabel")}
        help={
          assignmentEnd
            ? t("endHelpAssignment", {
                moment: formatMoment(assignmentEnd, locale, timeZone),
              })
            : t("endHelpNone")
        }
        error={
          problem === "unfinished"
            ? t("endUnfinished")
            : problem === "past"
              ? t("endPast")
              : problem === "afterAssignment" && assignmentEnd
                ? t("endAfterAssignment", {
                    moment: formatMoment(assignmentEnd, locale, timeZone),
                  })
                : undefined
        }
      >
        <Input
          type="datetime-local"
          name="end"
          value={end}
          disabled={saving}
          onChange={(event) => {
            setEnd(event.target.value);
            setUnfinished(isUnfinishedEnd(event.target));
          }}
          onBlur={(event) => setUnfinished(isUnfinishedEnd(event.target))}
        />
      </Field>
      <p className="mds-caption">{t("auditNote")}</p>
    </Dialog>
  );
}
