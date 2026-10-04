"use client";

import type {
  KoskGrantCourseResponse,
  KoskGrantResponse,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { Select } from "@medaris/ui/mds/select";
import { isoToZonedLocal, resolveEnd } from "@medaris/utils";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { HeadPicker } from "../../madrasahs/components/head-picker";
import type { PickedUser } from "../../madrasahs/present";
import { PermissionBoxes } from "../../permissions/components/permission-boxes";
import { formatDay, toggleExtra } from "../../permissions/present";
import { createGrant, updateGrant } from "../actions";
import { canSaveGrant, grantErrorKey, type Messages } from "../present";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  koskId: string;
  /** the post being edited; null makes a new ders nazırı */
  grant: KoskGrantResponse | null;
  /** courses a post can be made in (medrese-free) */
  courses: KoskGrantCourseResponse[];
  /** the codes the caller may hand out, in the order they are drawn */
  grantable: string[];
  /** called once the post is saved */
  onSaved?: () => void;
}

/**
 * "Ders nazırı ata" and "İzinleri düzenle" (nizam 38): the person (found by
 * e-mail), the course, the course permissions and an optional end (a date and
 * a time), in a Dialog with a Form. Only what the caller holds themselves is
 * offered; the server checks it again. The post and its permissions end at the same moment. The
 * scrim does not close it, so a stray click does not lose the boxes.
 */
export function GrantDialog({
  open,
  onOpenChange,
  koskId,
  grant,
  courses,
  grantable,
  onSaved,
}: Props) {
  const tm = useTranslations("nizam.KoskGrantDialog");
  const t = tm as unknown as Messages;
  const tp = useTranslations("nizam.KoskGrantsPage");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";

  const [picked, setPicked] = useState<PickedUser | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [end, setEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Every opening starts from what the post holds now (or from nothing).
  useEffect(() => {
    if (!open) return;
    setPicked(null);
    setCourseId(grant ? grant.course.id : null);
    setCodes(grant ? [...grant.permissions] : []);
    setEnd(isoToZonedLocal(grant?.endsAt, timeZone));
    setNow(new Date());
    setSaving(false);
  }, [open, grant, timeZone]);

  const sections = useMemo(
    () => [{ id: "course", permissions: grantable }],
    [grantable]
  );
  const ticked = useMemo(() => new Set(codes), [codes]);
  const { iso: endIso, problem } = resolveEnd({
    value: end,
    held: grant?.endsAt ?? null,
    timeZone,
    now,
    assignmentEnd: null,
  });
  const canSave = canSaveGrant({
    editing: grant !== null,
    personChosen: picked !== null,
    courseChosen: courseId !== null,
    permissionCount: codes.length,
    endProblem: problem,
  });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    const endsAt = endIso ? new Date(endIso) : null;
    const permissions = grantable.filter((c) => ticked.has(c));
    const result = grant
      ? await updateGrant(koskId, grant.id, { permissions, endsAt })
      : await createGrant(koskId, {
          userId: (picked as PickedUser).id,
          courseId: courseId as string,
          permissions,
          ...(endsAt ? { endsAt } : {}),
        });
    setSaving(false);
    if (!result.success) {
      toast.error(t(grant ? "failed" : "assignFailed"), {
        description: tp(grantErrorKey(result.errorBody) as never),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    const name = grant?.user.name ?? picked?.name ?? "";
    toast.success(t(grant ? "saved" : "assigned"), {
      description: t(grant ? "savedBody" : "assignedBody", { name }),
    });
    onSaved?.();
    onOpenChange(false);
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
      eyebrow={t("eyebrow")}
      title={grant ? t("titleEdit") : t("titleAssign")}
      closeLabel={t("close")}
      footerMeta={t("summary", { count: codes.length })}
      footer={
        <>
          <DialogClose>{t("cancel")}</DialogClose>
          <Button type="submit" loading={saving} disabled={!canSave}>
            {t("save")}
          </Button>
        </>
      }
    >
      {grant ? (
        <div className="flex items-center gap-3" data-testid="grant-card">
          <Avatar
            name={grant.user.name ?? grant.user.email ?? ""}
            size="lg"
            decorative
          />
          <span className="flex min-w-0 flex-col">
            <bdi className="font-semibold">
              {grant.user.name ?? t("unknownPerson")}
            </bdi>
            {grant.user.email ? (
              <bdi dir="ltr" className="mds-caption font-mono">
                {grant.user.email}
              </bdi>
            ) : null}
            <span className="mds-caption">
              {t("cardLine", {
                course: grant.course.title,
                by: grant.grantedBy.name ?? t("unknownPerson"),
                date: formatDay(grant.grantedAt, locale, timeZone),
              })}
            </span>
          </span>
        </div>
      ) : (
        <>
          <HeadPicker
            value={picked}
            onChange={setPicked}
            disabled={saving}
            label={t("personLabel")}
            chosenTitle={t("chosenTitle")}
            chosenNote={t("chosenNote")}
            name="nazirEmail"
          />
          <Field label={t("courseLabel")} required help={t("courseHelp")}>
            <Select
              value={courseId}
              onChange={setCourseId}
              disabled={saving}
              placeholder={t("coursePlaceholder")}
              options={courses.map((c) => ({ value: c.id, label: c.title }))}
            />
          </Field>
        </>
      )}

      <div className="flex flex-col gap-4">
        <h3 className="mds-h3">{t("permissionsHeading")}</h3>
        <PermissionBoxes
          sections={sections}
          checked={ticked}
          onToggle={(code, on) => setCodes((c) => toggleExtra(c, code, on))}
          disabled={saving}
        />
      </div>

      <Field
        label={t("endLabel")}
        help={t("endHelp")}
        error={problem ? t("endPast") : undefined}
      >
        <Input
          type="datetime-local"
          name="end"
          value={end}
          disabled={saving}
          onChange={(event) => setEnd(event.target.value)}
        />
      </Field>
      <p className="mds-caption">{t("auditNote")}</p>
    </Dialog>
  );
}
