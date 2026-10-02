"use client";

import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
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
import { readCourse, setCourseMuderris } from "../actions";
import {
  courseErrorKey,
  type TeamState,
  teamChanged,
  teamOfCourse,
  teamPayload,
  teamReady,
} from "../present";
import { TeamPicker } from "./team-picker";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  koskId: string;
  courseId: string;
  courseTitle: string;
  /** called once the list is saved */
  onSaved?: () => void;
}

/**
 * "Müderrisleri düzenle" (nizam 33): a Dialog with a Form over a köşk course.
 * The list and its version are read when it opens; "Kaydet" sends the whole list
 * with the imam in one write that tedrisat audits, and does nothing while the
 * list is empty or has several people and no imam. The scrim does not close it.
 */
export function MuderrisDialog({
  open,
  onOpenChange,
  koskId,
  courseId,
  courseTitle,
  onSaved,
}: Props) {
  const t = useTranslations("nizam.MuderrisDialog");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [stored, setStored] = useState<TeamState>({
    members: [],
    imamUserId: null,
  });
  const [team, setTeam] = useState<TeamState>(stored);
  const [saving, setSaving] = useState(false);
  const emailRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const result = await readCourse(courseId);
    setLoading(false);
    if (!result.success) {
      setFailed(true);
      return;
    }
    const next = teamOfCourse(result.data);
    setVersion(result.data.version);
    setStored(next);
    setTeam(next);
  }, [courseId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const payload = teamPayload(team, version);
  const dirty = teamChanged(stored, team);
  const ready = payload !== null && teamReady(team) && dirty;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!payload || !ready) return;
    setSaving(true);
    const result = await setCourseMuderris(koskId, courseId, payload);
    setSaving(false);
    if (!result.success) {
      const key = courseErrorKey(result.errorBody);
      toast.error(t("failed"), {
        description: t(`errors.${key}` as never),
        duration: Number.POSITIVE_INFINITY,
      });
      if (key === "versionConflict") void load();
      return;
    }
    toast.success(t("saved"), {
      description: t("savedBody", { name: courseTitle }),
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
      eyebrow={courseTitle}
      title={t("title")}
      closeLabel={t("close")}
      initialFocus={emailRef}
      footerMeta={t("auditNote")}
      footer={
        <>
          <DialogClose>{t("cancel")}</DialogClose>
          <Button
            type="submit"
            loading={saving}
            disabled={!ready || loading || failed}
          >
            {t("submit")}
          </Button>
        </>
      }
    >
      <p>
        <strong>
          <bdi>{courseTitle}</bdi>
        </strong>{" "}
        {t("intro")}
      </p>
      {loading ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton height="4rem" />
          <Skeleton height="4rem" />
        </div>
      ) : failed ? (
        <Alert tone="error" title={t("loadFailedTitle")}>
          <p>{t("loadFailed")}</p>
          <Button variant="outline" size="small" onClick={() => void load()}>
            {t("retry")}
          </Button>
        </Alert>
      ) : (
        <TeamPicker
          listFirst
          name="dialogImam"
          value={team}
          onChange={setTeam}
          disabled={saving}
          inputRef={emailRef}
          error={t("emptyError")}
        />
      )}
    </Dialog>
  );
}
