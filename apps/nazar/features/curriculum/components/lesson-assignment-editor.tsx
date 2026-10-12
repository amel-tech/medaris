"use client";

import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { IconButton } from "@medaris/ui/mds/icon-button";
import { Switch } from "@medaris/ui/mds/switch";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { ActionOutcome } from "~/lib/authenticated-action";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { FileLink } from "../../files/components/file-link";
import {
  FileUpload,
  type UploadControl,
} from "../../files/components/file-upload";
import { fileErrorKey, fileRoutes } from "../../files/files";
import {
  deleteLessonAssignment,
  deleteLessonAssignmentFile,
  saveLessonAssignment,
} from "../actions";
import {
  ASSIGNMENT_DESCRIPTION_MAX,
  type AssignmentAnswer,
  type AssignmentState,
  assignmentDescriptionBody,
  assignmentStateOf,
} from "../curriculum";

type Asking =
  | { kind: "assignment" }
  | { kind: "file"; id: string; name: string };

/**
 * "Ödev" on a celse of the curriculum: the homework the course team sets on
 * the celse, in a block of its own under "Celsenin kaynakları", never one of
 * its rows. The owner, 2026-10-12: "ders/celse kaynağı ile ödev yükleme ve
 * gösterim alanları ayrı olsun, ödevin ödev olduğu anlaşılsın".
 *
 * "Bu celsenin ödevi var" turns it on and off; on, it takes an optional
 * description (plain text, line breaks kept) and its own files, through the
 * resources' upload route and checks but stored as the homework's. Unlike
 * the rest of the form each change is stored at once, and none waits for
 * "Kaydet": the homework is no part of the whole-course save. Turning it off
 * asks first when there is anything to lose, as removing a file does: both
 * delete for good. The talebe's submissions stay either way.
 *
 * Changing it is `session.manage`, the permission that edits the celse's
 * resources; without it the block is read-only. A content-locked read
 * carries no homework, so it says so and offers nothing. A celse added on
 * this page has no id until the curriculum is saved.
 */
export function LessonAssignmentEditor({
  prefix,
  lessonId,
  assignment,
  onChange,
  locked,
  editable,
  disabled,
  upload,
  locale,
}: {
  /** the session's field names, `lesson-<week>-<session>` */
  prefix: string;
  /** the stored session's id; none for one added on this page */
  lessonId: string | undefined;
  /** the homework as stored; null when the celse has none */
  assignment: AssignmentState | null;
  /** told what is stored after each change */
  onChange: (next: AssignmentState | null) => void;
  /** the course was read content-locked: no homework to show */
  locked: boolean;
  /** `session.manage`: the homework can be changed */
  editable: boolean;
  /** the form is saving or reading the course again */
  disabled: boolean;
  /** the page's one-at-a-time upload slot */
  upload: Pick<UploadControl<unknown>, "blocked" | "onBusyChange">;
  locale: string;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const { notify } = useToaster();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(assignment?.description ?? "");
  const [saved, setSaved] = useState(false);
  const [asking, setAsking] = useState<Asking | null>(null);

  const off = disabled || busy || !editable;
  const tooLong = draft.trim().length > ASSIGNMENT_DESCRIPTION_MAX;
  const dirty =
    assignment !== null &&
    assignmentDescriptionBody(draft) !==
      assignmentDescriptionBody(assignment.description);

  /**
   * Runs one write; a refusal is a toast worded from its code. A removal
   * names the code that means it is gone already, which is what it asked for.
   */
  const run = async <T,>(
    write: () => Promise<ActionOutcome<T>>,
    done: (data?: T) => void,
    goneCode?: string
  ) => {
    setBusy(true);
    try {
      const result = await write();
      if (handleUnauthenticated(result)) return;
      if ("success" in result && result.success) {
        done(result.data);
      } else {
        const code = "code" in result ? result.code : "";
        if (goneCode && code === goneCode) return done();
        notify({
          tone: "error",
          title: t("Curriculum.assignmentFailed"),
          description:
            code === "VALIDATION_ERROR"
              ? t("Curriculum.assignmentTooLong", {
                  max: ASSIGNMENT_DESCRIPTION_MAX,
                })
              : words(fileErrorKey(code)),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const stored = (data: AssignmentAnswer | undefined) => {
    setDraft(data?.description ?? "");
    onChange(assignmentStateOf(data));
  };
  const turnOn = (id: string) =>
    run(() => saveLessonAssignment(id, null), stored);
  const takeOff = (id: string) =>
    run(
      () => deleteLessonAssignment(id),
      () => {
        setDraft("");
        onChange(null);
        notify({ title: t("Curriculum.assignmentRemoved") });
      },
      "LESSON_ASSIGNMENT_NOT_FOUND"
    ).finally(() => setAsking(null));
  const saveDescription = (id: string) =>
    run(
      () => saveLessonAssignment(id, assignmentDescriptionBody(draft)),
      (data) => {
        stored(data);
        setSaved(true);
      }
    );
  const removeFile = (id: string, fileId: string) =>
    run(
      () => deleteLessonAssignmentFile(id, fileId),
      () =>
        assignment &&
        onChange({
          ...assignment,
          files: assignment.files.filter((file) => file.id !== fileId),
        }),
      "LESSON_ASSIGNMENT_FILE_NOT_FOUND"
    ).finally(() => setAsking(null));

  const note = locked
    ? t("Curriculum.assignmentLocked")
    : !lessonId
      ? t("Curriculum.assignmentSaveFirst")
      : editable
        ? t("Curriculum.assignmentIntro")
        : t("Curriculum.assignmentSessions");

  return (
    <div
      className="border-bs border-neutral-subtle pbs-3"
      data-testid={`assignment-${prefix}`}
    >
      <fieldset className="flex min-inline-0 flex-col gap-3 border-0 p-0">
        <legend className="mds-label flex items-center gap-2 pbe-1">
          <Icon name="note" size="sm" />
          {t("Curriculum.assignmentTitle")}
        </legend>
        <p className="mds-caption">{note}</p>
        {locked || !lessonId ? null : (
          <>
            <Switch
              label={t("Curriculum.assignmentToggle")}
              description={t("Curriculum.assignmentToggleHelp")}
              checked={assignment !== null}
              disabled={off}
              onCheckedChange={(checked) => {
                if (checked) return void turnOn(lessonId);
                if (
                  assignment &&
                  (assignment.description.trim() || assignment.files.length)
                ) {
                  setAsking({ kind: "assignment" });
                } else {
                  void takeOff(lessonId);
                }
              }}
            />
            {assignment ? (
              <>
                {editable ? (
                  <div className="flex flex-col gap-2">
                    <Field
                      label={t("Curriculum.assignmentDescLabel")}
                      help={t("Curriculum.assignmentDescHelp")}
                      error={
                        tooLong
                          ? t("Curriculum.assignmentTooLong", {
                              max: ASSIGNMENT_DESCRIPTION_MAX,
                            })
                          : undefined
                      }
                    >
                      <Textarea
                        name={`${prefix}-assignment-description`}
                        rows={4}
                        dir="auto"
                        maxLength={ASSIGNMENT_DESCRIPTION_MAX}
                        value={draft}
                        disabled={off}
                        onChange={(event) => {
                          setDraft(event.target.value);
                          setSaved(false);
                        }}
                      />
                    </Field>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        variant="outline"
                        size="small"
                        type="button"
                        disabled={!dirty || tooLong || off}
                        loading={busy && dirty}
                        loadingLabel={t("Curriculum.assignmentDescSaving")}
                        onClick={() => void saveDescription(lessonId)}
                      >
                        {t("Curriculum.assignmentDescSave")}
                      </Button>
                      {dirty ? (
                        <output className="mds-caption">
                          {t("Curriculum.assignmentDescDirty")}
                        </output>
                      ) : saved ? (
                        <output className="mds-caption">
                          {t("Curriculum.assignmentDescSaved")}
                        </output>
                      ) : null}
                    </div>
                  </div>
                ) : assignment.description.trim() ? (
                  <p
                    className="mds-body-sm whitespace-pre-line break-words"
                    dir="auto"
                  >
                    {assignment.description}
                  </p>
                ) : null}

                <div className="flex flex-col gap-2">
                  <h4 className="mds-label">
                    {t("Curriculum.assignmentFilesTitle")}
                  </h4>
                  {assignment.files.length === 0 ? (
                    <p className="mds-body-sm">
                      {t("Curriculum.assignmentFilesEmpty")}
                    </p>
                  ) : (
                    <ul
                      className="m-0 flex list-none flex-col p-0"
                      data-testid={`assignment-files-${prefix}`}
                    >
                      {assignment.files.map((file) => (
                        <li
                          key={file.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-2 border-be border-neutral-subtle last:border-be-0"
                        >
                          <FileLink
                            file={file}
                            href={fileRoutes.lessonAssignmentFile(
                              lessonId,
                              file.id
                            )}
                            locale={locale}
                          />
                          {editable ? (
                            <IconButton
                              size="small"
                              icon={<Icon name="trash" size="sm" />}
                              label={t("Curriculum.assignmentFileRemove", {
                                name: file.name,
                              })}
                              disabled={off}
                              onClick={() =>
                                setAsking({
                                  kind: "file",
                                  id: file.id,
                                  name: file.name,
                                })
                              }
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  {editable ? (
                    <div className="flex flex-wrap items-start gap-2">
                      <FileUpload
                        prefix={`${prefix}-assignment`}
                        kind="assignment"
                        control={{
                          route: fileRoutes.lessonAssignment(lessonId),
                          blocked: upload.blocked || busy,
                          onBusyChange: upload.onBusyChange,
                          onUploaded: (data: AssignmentAnswer) =>
                            onChange(assignmentStateOf(data)),
                        }}
                        disabled={disabled}
                        locale={locale}
                      />
                    </div>
                  ) : null}
                </div>
              </>
            ) : !editable ? (
              <p className="mds-body-sm">{t("Curriculum.assignmentNone")}</p>
            ) : null}
          </>
        )}
      </fieldset>
      {asking && lessonId ? (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setAsking(null);
          }}
          title={
            asking.kind === "assignment"
              ? t("Curriculum.assignmentRemoveTitle")
              : t("Curriculum.assignmentFileRemoveTitle")
          }
          confirmLabel={
            asking.kind === "assignment"
              ? t("Curriculum.assignmentRemoveConfirm")
              : t("Curriculum.assignmentFileRemoveConfirm")
          }
          cancelLabel={t("Files.cancel")}
          closeLabel={t("Shell.close")}
          confirmVariant="destructive"
          confirmLoading={busy}
          onConfirm={() =>
            asking.kind === "assignment"
              ? void takeOff(lessonId)
              : void removeFile(lessonId, asking.id)
          }
        >
          {asking.kind === "assignment" ? (
            <p>{t("Curriculum.assignmentRemoveBody")}</p>
          ) : (
            <p>
              <bdi className="font-semibold text-neutral-default">
                {asking.name}
              </bdi>{" "}
              {t("Curriculum.assignmentFileRemoveBody")}
            </p>
          )}
        </AlertDialog>
      ) : null}
    </div>
  );
}
