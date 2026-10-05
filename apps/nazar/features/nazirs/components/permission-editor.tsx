"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { Checkbox } from "@medaris/ui/mds/checkbox";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { Select } from "@medaris/ui/mds/select";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { useToaster } from "@medaris/ui/mds/toast";
import { isUnfinishedEnd } from "@medaris/utils";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import type { Messages } from "~/lib/i18n/messages";
import { type EditorData, loadEditor, saveNazirPermissions } from "../actions";
import { type NazirRow, nazirErrorKey, permissionLabel } from "../nazirs";
import {
  type EditorDraft,
  editorProblems,
  editorRequest,
  editorSummary,
  hasProblem,
  heldGroup,
  initialDraft,
  isLocked,
  isTicked,
  notLimitable,
  permissionCounts,
  pickGroup,
  tick,
  toggleCourse,
} from "../permissions";
import { PermissionSection } from "./permission-section";

/** The select's value for "Grup yok"; a group's id is a UUID, so it cannot be mistaken for one. */
const NO_GROUP = "none";
const EVERY_COURSE = "all";
const SOME_COURSES = "chosen";

/**
 * "İzinleri düzenle" / "İzin ver" (nazir 06, _kurallar 15): a Dialog with a
 * Form on the nazır's row. It opens by reading, together, the dictionary, the
 * medrese's groups, what the nazır holds and the medrese's courses, and shows
 * bars until they are there; if any of them cannot be read it says so and
 * saves nothing, since a form half read would save over what it did not show.
 *
 * The group's permissions come ticked and locked ("Gruptan gelir."); the rest
 * are single permissions on top. A permission the caller may not give is off.
 * "Hangi derslerde" names courses only where that means something (a group with
 * a medrese permission covers every course, and with no course permission
 * there is nothing to limit). The end is a date and a time on the viewer's
 * clock: the permission lapses at that moment. The scrim does not close the dialog.
 */
export function PermissionEditor({
  madrasahId,
  madrasahName,
  nazir,
  timeZone,
  onClose,
  onDone,
}: {
  madrasahId: string;
  madrasahName: string;
  /** the nazır being edited; null while the dialog is shut */
  nazir: NazirRow | null;
  /** the viewer's zone: "Bitiş tarihi ve saati" is read on their clock */
  timeZone: string;
  onClose: () => void;
  /** called once the permissions are saved, for the page to read the roster again */
  onDone: () => void;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<EditorData | "failed" | null>(null);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [attempted, setAttempted] = useState(false);
  const groupId = useId();
  const userId = nazir?.id;

  // Only the latest ask may answer: a nazır opened after another must not show the first one's state.
  const asked = useRef(0);

  const load = useCallback(async () => {
    if (!userId) return;
    const ask = ++asked.current;
    setData(null);
    setDraft(null);
    const result = await loadEditor(madrasahId, userId);
    if (ask !== asked.current) return;
    if (result.success) {
      setData(result.data);
      setDraft(initialDraft(result.data.held, result.data.groups, timeZone));
    } else {
      setData("failed");
    }
  }, [madrasahId, userId, timeZone]);

  useEffect(() => {
    setAttempted(false);
    if (userId) void load();
    else setData(null);
  }, [userId, load]);

  const editor =
    data !== null && data !== "failed" && draft !== null
      ? { data, draft }
      : null;
  const ready = editor !== null;

  // The form's first field is the group; it exists only once the data is there.
  useEffect(() => {
    if (ready) document.getElementById(groupId)?.focus();
  }, [ready, groupId]);

  const catalog = editor?.data.catalog;
  const group = editor ? heldGroup(editor.draft, editor.data.groups) : null;
  const ctx = {
    now: Date.now(),
    timeZone,
    assignmentEnd: nazir?.assignmentEnd ?? null,
  };
  const problems =
    editor && catalog
      ? editorProblems(editor.draft, group, catalog, editor.data.held, ctx)
      : null;
  const limit =
    editor && catalog ? notLimitable(editor.draft, group, catalog) : null;
  const spans = limit === "group-spans-medrese";
  const givable = new Set(catalog?.givable ?? []);
  const label = (code: string) => permissionLabel(code, words);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || !catalog || !nazir || pending) return;
    setAttempted(true);
    // A half-typed picker reads "" and may never have been left, so it is read again here.
    const sent = isUnfinishedEnd(
      event.currentTarget.elements.namedItem("expiresAt")
    )
      ? { ...editor.draft, expiresUnfinished: true }
      : editor.draft;
    if (
      hasProblem(editorProblems(sent, group, catalog, editor.data.held, ctx))
    ) {
      if (sent !== editor.draft) setDraft(sent);
      return;
    }
    const request = editorRequest(sent, group, catalog, editor.data.held, ctx);
    startTransition(async () => {
      const result = await saveNazirPermissions(madrasahId, nazir.id, request);
      if (result.success) {
        notify({
          tone: "success",
          title: t("Editor.saved"),
          description: t("Editor.savedBody", { name: nazir.name }),
        });
        onClose();
        onDone();
        return;
      }
      notify({
        tone: "error",
        title: t("Editor.failedTitle"),
        description: words(nazirErrorKey(result.code)),
      });
      if (result.code === "PERMISSION_GROUP_NOT_FOUND") {
        void load();
      } else if (result.code === "MADRASAH_NAZIR_NOT_FOUND") {
        onClose();
        onDone();
      }
    });
  };

  const counts =
    editor && catalog
      ? permissionCounts(editor.draft, group, catalog)
      : { group: 0, extra: 0 };

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
      title={t("Editor.title")}
      closeLabel={t("Shell.close")}
      footerMeta={editor ? editorSummary(counts, words) : undefined}
      footer={
        <>
          <DialogClose>{t("Editor.cancel")}</DialogClose>
          <Button type="submit" loading={pending} disabled={!editor}>
            {t("Editor.save")}
          </Button>
        </>
      }
    >
      {nazir ? (
        <div className="flex items-center gap-3">
          <Avatar name={nazir.name} size="lg" decorative />
          <span className="flex min-inline-0 flex-col">
            <bdi className="font-semibold text-neutral-default">
              {nazir.name}
            </bdi>
            {nazir.email ? (
              <bdi dir="ltr" className="mds-caption break-all font-mono">
                {nazir.email}
              </bdi>
            ) : null}
            <span className="mds-caption">
              <bdi>
                {t("Editor.role")} · {nazir.appointedLine}
              </bdi>
            </span>
          </span>
        </div>
      ) : null}
      {data === null ? (
        <output className="flex flex-col gap-3" aria-busy="true">
          <span className="mds-visually-hidden">{t("Shell.loadingLabel")}</span>
          <Skeleton height="3rem" />
          <Skeleton height="10rem" />
          <Skeleton height="10rem" />
        </output>
      ) : data === "failed" ? (
        <Alert tone="error" title={t("Editor.loadFailedTitle")}>
          <p>{t("Editor.loadFailed")}</p>
          <Button variant="outline" size="small" onClick={() => void load()}>
            {t("Shell.retry")}
          </Button>
        </Alert>
      ) : editor && catalog && problems ? (
        <>
          <Field label={t("Editor.group")} help={t("Editor.groupHelp")}>
            <Select
              id={groupId}
              value={editor.draft.groupId ?? NO_GROUP}
              options={[
                { value: NO_GROUP, label: t("Editor.groupNone") },
                ...editor.data.groups.map((candidate) => ({
                  value: candidate.id,
                  label: candidate.name,
                })),
              ]}
              onChange={(value) =>
                setDraft(
                  pickGroup(
                    editor.draft,
                    editor.data.groups.find((g) => g.id === value) ?? null,
                    catalog
                  )
                )
              }
            />
          </Field>

          <div className="flex flex-col gap-section">
            <p className="mds-label">{t("Editor.permissions")}</p>
            <PermissionSection
              title={t("Editor.madrasahSection")}
              codes={catalog.madrasah}
              labelOf={label}
              ticked={(code) => isTicked(code, editor.draft, group)}
              locked={(code) => isLocked(code, group)}
              disabled={(code) => !givable.has(code)}
              lockedNote={t("Editor.fromGroup")}
              onToggle={(code, on) => setDraft(tick(editor.draft, code, on))}
            />
            <hr className="mds-separator" />
            <PermissionSection
              title={t("Editor.courseSection")}
              codes={catalog.course}
              labelOf={label}
              ticked={(code) => isTicked(code, editor.draft, group)}
              locked={(code) => isLocked(code, group)}
              disabled={(code) => !givable.has(code)}
              lockedNote={t("Editor.fromGroup")}
              onToggle={(code, on) => setDraft(tick(editor.draft, code, on))}
            >
              <Field
                label={t("Editor.where")}
                help={
                  limit === "group-spans-medrese"
                    ? t("Editor.whereGroupSpans")
                    : editor.draft.everyCourse
                      ? t("Editor.whereAllHelp")
                      : limit === "no-course-permission"
                        ? t("Editor.whereNeedsCoursePermission")
                        : t("Editor.whereChosenHelp")
                }
              >
                <Select
                  value={
                    editor.draft.everyCourse || spans
                      ? EVERY_COURSE
                      : SOME_COURSES
                  }
                  disabled={spans}
                  options={[
                    { value: EVERY_COURSE, label: t("Editor.whereAll") },
                    { value: SOME_COURSES, label: t("Editor.whereChosen") },
                  ]}
                  onChange={(value) =>
                    setDraft({
                      ...editor.draft,
                      everyCourse: value !== SOME_COURSES,
                    })
                  }
                />
              </Field>
              {!editor.draft.everyCourse && !spans ? (
                <fieldset
                  className="flex min-inline-0 flex-col gap-2 border-0 p-0"
                  data-testid="chosen-courses"
                >
                  <legend className="mds-label pbe-2">
                    {t("Editor.courses")}
                  </legend>
                  {editor.data.courses.length === 0 ? (
                    <p className="mds-caption">{t("Editor.noCourses")}</p>
                  ) : (
                    editor.data.courses.map((course) => (
                      <Checkbox
                        key={course.id}
                        label={<bdi>{course.title}</bdi>}
                        checked={editor.draft.courseIds.includes(course.id)}
                        onCheckedChange={(on) =>
                          setDraft(toggleCourse(editor.draft, course.id, on))
                        }
                      />
                    ))
                  )}
                  {attempted && problems.courses ? (
                    <p className="mds-error" role="alert">
                      {t("Editor.coursesProblem")}
                    </p>
                  ) : null}
                </fieldset>
              ) : null}
            </PermissionSection>
          </div>

          <Field
            label={t("Editor.expires")}
            help={t("Editor.expiresHelp")}
            error={
              attempted && problems.expires
                ? t(`Editor.expiresProblems.${problems.expires}`)
                : undefined
            }
          >
            <Input
              type="datetime-local"
              name="expiresAt"
              value={editor.draft.expiresAtLocal}
              onChange={(event) =>
                setDraft({
                  ...editor.draft,
                  expiresAtLocal: event.target.value,
                  expiresUnfinished: isUnfinishedEnd(event.target),
                })
              }
              onBlur={(event) =>
                setDraft({
                  ...editor.draft,
                  expiresUnfinished: isUnfinishedEnd(event.target),
                })
              }
            />
          </Field>
          <p className="mds-caption">{t("Editor.note")}</p>
        </>
      ) : null}
    </Dialog>
  );
}
