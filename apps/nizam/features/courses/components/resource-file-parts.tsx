"use client";

import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { redirectIfUnauthenticated } from "~/lib/unauthenticated";
import type { ResourceFileDraft } from "../present";
import {
  FILE_FIELD_ERRORS,
  fileKind,
  fileProblem,
  formatFileSize,
  RESOURCE_FILE_ACCEPT,
  type UploadErrorKey,
  uploadResourceFile,
} from "../resource-files";

/**
 * A resource's uploaded file on its row (MDRS-287): the name it was uploaded
 * under as a plain download link through the app's own route, a chip of its
 * type and its size. The route answers with `Content-Disposition: attachment`,
 * so the file is saved, never opened on the app's origin.
 */
export function ResourceFileLine({
  file,
  href,
}: {
  file: ResourceFileDraft;
  href: string;
}) {
  const t = useTranslations("nizam.Curriculum");
  const locale = useLocale();
  const kind = fileKind(file.contentType, file.name);
  return (
    <div className="flex flex-col gap-1" data-testid="resource-file">
      <span className="mds-label">{t("fileLabel")}</span>
      <p className="m-0 flex flex-wrap items-center gap-2">
        <Icon name={kind === "PDF" ? "pdf" : "doc"} size="sm" />
        <a className="mds-link" href={href} download>
          <bdi>{file.name}</bdi>
        </a>
        <Badge variant="outline">{kind ?? t("fileKindOther")}</Badge>
        <span className="mds-caption">
          {formatFileSize(file.sizeBytes, locale)}
        </span>
      </p>
    </div>
  );
}

/**
 * "Kaynağı çıkar" on a file asks first: the row leaves the form at once, and
 * the save that follows deletes the file from storage for good (MDRS-287).
 * "Vazgeç" on the page still puts the row back until then.
 */
export function RemoveFileDialog({
  name,
  open,
  onCancel,
  onConfirm,
}: {
  name: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("nizam.Curriculum");
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      eyebrow={name}
      title={t("removeFileTitle")}
      confirmLabel={t("removeFileConfirm")}
      confirmVariant="destructive"
      cancelLabel={t("cancel")}
      closeLabel={t("close")}
      onConfirm={onConfirm}
    >
      <p>{t("removeFileBody", { name })}</p>
      <p className="mds-caption">{t("removeFileWay")}</p>
    </AlertDialog>
  );
}

/**
 * "Dosya yükle" beside "Kaynak ekle" (MDRS-287): a file, and optionally the
 * name the list shows and a short line, sent to the app's upload route
 * (`path`), which hands it to tedrisat with the caller's token. tedrisat adds
 * the row last at once and answers it with the course's new version; the
 * editor keeps both (`onUploaded`), so the row needs no "Kaydet" and the next
 * save does not conflict. An empty or too large file is refused before it is
 * sent; tedrisat's refusals are worded from their code. A session that ended
 * goes to sign-in and back. The dialog cannot be closed while a file is on
 * its way.
 */
export function ResourceUploadDialog<R extends { name: string }>({
  path,
  eyebrow,
  disabled = false,
  onUploaded,
  testId,
}: {
  /** the app's upload route (`resource-files.ts`) */
  path: string;
  /** where the file goes: the course, or the session */
  eyebrow: string;
  disabled?: boolean;
  onUploaded: (answer: { resource: R; courseVersion: number }) => void;
  testId: string;
}) {
  const t = useTranslations("nizam.Curriculum");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [meta, setMeta] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UploadErrorKey | null>(null);

  const reset = () => {
    setFile(null);
    setName("");
    setMeta("");
    setError(null);
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    // The dialog's form sits inside the curriculum's in React's tree (the
    // portal moves only the DOM), so its submit would also reach "Kaydet".
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    const problem = fileProblem(file);
    if (problem || !file) {
      setError(problem ?? "required");
      return;
    }
    setError(null);
    setBusy(true);
    const outcome = await uploadResourceFile<R>(path, { file, name, meta });
    if (outcome.kind === "signIn") {
      // The page is on its way to sign-in: nothing else is drawn.
      redirectIfUnauthenticated(outcome.body);
      return;
    }
    setBusy(false);
    if (outcome.kind === "refused") {
      setError(outcome.error);
      return;
    }
    onUploaded({
      resource: outcome.resource,
      courseVersion: outcome.courseVersion,
    });
    toast.success(t("uploaded"), {
      description: t("uploadedBody", { name: outcome.resource.name }),
    });
    setOpen(false);
    reset();
  };

  const fileError = error && FILE_FIELD_ERRORS.has(error) ? error : null;
  const otherError = error && !FILE_FIELD_ERRORS.has(error) ? error : null;

  return (
    <>
      <Button
        variant="outline"
        size="small"
        type="button"
        disabled={disabled}
        iconLeft={<Icon name="upload" size="sm" />}
        onClick={() => setOpen(true)}
        data-testid={testId}
      >
        {t("uploadFile")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          setOpen(next);
          if (!next) reset();
        }}
        form
        onSubmit={send}
        eyebrow={eyebrow}
        title={t("uploadTitle")}
        closeLabel={t("close")}
        footer={
          <>
            <DialogClose>{t("cancel")}</DialogClose>
            <Button
              type="submit"
              loading={busy}
              loadingLabel={t("uploading")}
              iconLeft={<Icon name="upload" size="sm" />}
            >
              {t("uploadSubmit")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4" data-testid="upload-dialog">
          <p className="mds-caption">{t("uploadIntro")}</p>
          <Field
            label={t("uploadFileLabel")}
            required
            help={t("uploadFileHelp")}
            error={
              fileError ? t(`uploadErrors.${fileError}` as never) : undefined
            }
          >
            <Input
              type="file"
              name="file"
              accept={RESOURCE_FILE_ACCEPT}
              disabled={busy}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError(null);
              }}
            />
          </Field>
          {file ? (
            <p className="mds-caption" data-testid="upload-chosen">
              <bdi>
                {t("uploadChosen", {
                  name: file.name,
                  size: formatFileSize(file.size, locale),
                })}
              </bdi>
            </p>
          ) : null}
          <Field label={t("resourceNameLabel")} help={t("uploadNameHelp")}>
            <Input
              name="upload-name"
              value={name}
              maxLength={200}
              dir="auto"
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label={t("resourceMetaLabel")} help={t("resourceMetaHelp")}>
            <Input
              name="upload-meta"
              value={meta}
              maxLength={120}
              dir="auto"
              disabled={busy}
              onChange={(event) => setMeta(event.target.value)}
            />
          </Field>
          {busy && file ? (
            <output className="mds-body-sm" data-testid="upload-status">
              <bdi>{t("uploadingFile", { name: file.name })}</bdi>
            </output>
          ) : null}
          {otherError ? (
            <Alert tone="error">
              {t(`uploadErrors.${otherError}` as never)}
            </Alert>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
