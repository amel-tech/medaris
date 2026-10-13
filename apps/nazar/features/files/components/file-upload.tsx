"use client";

import { FILE_ACCEPT, formatFileSize } from "@medaris/services/file-rules";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { useToaster } from "@medaris/ui/mds/toast";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useId, useState } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { type FileProblem, fileErrorKey, fileProblem } from "../files";
import { uploadFile } from "../upload";

/** What an editor hands its "Dosya yükle" (MDRS-287). */
export interface UploadControl<T> {
  /**
   * This app's upload route for the list (`fileRoutes`), or null when there
   * is nowhere to upload to yet: a session added on this page has no id
   * until the curriculum is saved.
   */
  route: string | null;
  /** another upload of the page is running: one at a time */
  blocked: boolean;
  /** told when this upload starts and when it is over, either way */
  onBusyChange: (busy: boolean) => void;
  /** tedrisat's answer: the stored row and the course's new version */
  onUploaded: (data: T) => void;
}

type Step =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "failed"; code: string };

/**
 * "Dosya yükle" beside "Bağlantı ekle" in a resources list (MDRS-287): opens a
 * small panel to choose a file and, if wanted, its name and short line, and
 * sends it at once through this app's route. Unlike a link, the row is stored
 * by the upload itself, not by the curriculum's "Kaydet": the panel says so,
 * and the editor adds the stored row to its list and takes the course's new
 * version. A file over 25 MB or an empty one is refused before it is sent;
 * the server checks the type from the bytes and refuses anything else with a
 * code the panel words. A session that is over goes to sign in.
 *
 * The panel sits inside the curriculum's form: Enter in its fields uploads
 * rather than saving the curriculum.
 *
 * For a celse's homework (`kind="assignment"`) the panel takes the file
 * alone: a homework file has no name or short line of its own, and it is
 * added to the homework, never to a resource list.
 */
export function FileUpload<T>({
  prefix,
  control,
  disabled,
  locale,
  kind = "resource",
}: {
  /** the field names, e.g. `resource` or `lesson-1-0-resource` */
  prefix: string;
  control: UploadControl<T>;
  /** the form is locked: saving, or reading the course again */
  disabled: boolean;
  locale: string;
  /** what the file becomes: a row of a resource list, or a file of a celse's homework */
  kind?: "resource" | "assignment";
}) {
  const resource = kind === "resource";
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const { notify } = useToaster();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [meta, setMeta] = useState("");
  const [problem, setProblem] = useState<FileProblem | "missing" | null>(null);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const uploading = step.kind === "uploading";

  const close = () => {
    setOpen(false);
    setFile(null);
    setName("");
    setMeta("");
    setProblem(null);
    setStep({ kind: "idle" });
  };

  const choose = (chosen: File | null) => {
    setFile(chosen);
    setProblem(chosen ? fileProblem(chosen) : null);
    setStep({ kind: "idle" });
  };

  const send = async () => {
    if (uploading || !control.route || control.blocked) return;
    if (!file) {
      setProblem("missing");
      return;
    }
    const refused = fileProblem(file);
    if (refused) {
      setProblem(refused);
      return;
    }
    setStep({ kind: "uploading" });
    control.onBusyChange(true);
    const outcome = await uploadFile<T>(
      control.route,
      resource ? { file, name, meta } : { file }
    );
    control.onBusyChange(false);
    if (outcome.status === "signedOut") return;
    if (outcome.status === "failed") {
      setStep({ kind: "failed", code: outcome.code });
      return;
    }
    control.onUploaded(outcome.data);
    notify({
      title: t("Files.uploaded"),
      description: resource
        ? t("Files.uploadedBody", { name: name.trim() || file.name })
        : t("Files.assignmentUploadedBody", { name: file.name }),
    });
    close();
  };

  // Enter in a text field would submit the curriculum's form around the panel.
  const onKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    if (
      event.key === "Enter" &&
      event.target instanceof HTMLInputElement &&
      event.target.type !== "file"
    ) {
      event.preventDefault();
      void send();
    }
  };

  if (!open) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="small"
          type="button"
          disabled={disabled || !control.route || control.blocked}
          iconLeft={<Icon name="upload" size="sm" />}
          aria-describedby={control.route ? undefined : `${id}-unsaved`}
          onClick={() => setOpen(true)}
        >
          {t("Files.upload")}
        </Button>
        {control.route ? null : (
          <span id={`${id}-unsaved`} className="mds-caption">
            {t("Files.saveFirst")}
          </span>
        )}
      </span>
    );
  }

  return (
    <div
      className="inline-full rounded-surface border border-neutral-subtle p-4"
      data-testid={`${prefix}-upload`}
    >
      <fieldset
        className="flex min-inline-0 flex-col gap-3 border-0 p-0"
        onKeyDown={onKeyDown}
      >
        <legend className="mds-label pbe-1">{t("Files.uploadTitle")}</legend>
        <p className="mds-caption">
          {t(resource ? "Files.uploadNote" : "Files.assignmentUploadNote")}
        </p>
        <Field
          label={t("Files.fileLabel")}
          required
          help={t("Files.fileHelp")}
          error={problem ? t(`Files.problems.${problem}`) : undefined}
        >
          <Input
            type="file"
            name={`${prefix}-upload-file`}
            accept={FILE_ACCEPT}
            disabled={uploading}
            onChange={(event) => choose(event.target.files?.[0] ?? null)}
          />
        </Field>
        {file ? (
          <p className="mds-caption" data-testid={`${prefix}-upload-chosen`}>
            <bdi>
              {t("Files.chosen", {
                name: file.name,
                size: formatFileSize(file.size, locale),
              })}
            </bdi>
          </p>
        ) : null}
        {resource ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("Files.nameLabel")} help={t("Files.nameHelp")}>
              <Input
                name={`${prefix}-upload-name`}
                value={name}
                maxLength={200}
                dir="auto"
                disabled={uploading}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field
              label={t("Curriculum.resourceMetaLabel")}
              help={t("Curriculum.resourceMetaHelp")}
            >
              <Input
                name={`${prefix}-upload-meta`}
                value={meta}
                maxLength={120}
                dir="auto"
                disabled={uploading}
                onChange={(event) => setMeta(event.target.value)}
              />
            </Field>
          </div>
        ) : null}
        {uploading ? (
          <output className="mds-body-sm" data-testid={`${prefix}-uploading`}>
            {t("Files.uploading")}
          </output>
        ) : null}
        {step.kind === "failed" ? (
          <Alert tone="error" title={t("Files.failed")}>
            <p>{words(fileErrorKey(step.code))}</p>
          </Alert>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="small"
            type="button"
            loading={uploading}
            loadingLabel={t("Files.uploading")}
            disabled={disabled || (control.blocked && !uploading)}
            iconLeft={<Icon name="upload" size="sm" />}
            onClick={() => void send()}
          >
            {t("Files.send")}
          </Button>
          <Button
            variant="ghost"
            size="small"
            type="button"
            disabled={uploading}
            onClick={close}
          >
            {t("Files.cancel")}
          </Button>
        </div>
      </fieldset>
    </div>
  );
}
