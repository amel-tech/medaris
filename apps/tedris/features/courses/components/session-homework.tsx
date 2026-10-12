"use client";

import {
  FILE_ACCEPT,
  fileTypeChip,
  formatFileSize,
  MAX_FILE_BYTES,
  MAX_SUBMISSION_FILES,
} from "@medaris/services/file-rules";
import type {
  LessonSubmissionResponse,
  SubmissionFileResponse,
} from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { IconButton } from "@medaris/ui/mds/icon-button";
import { Input } from "@medaris/ui/mds/input";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { sendToSignIn } from "~/lib/send-to-sign-in";
import {
  deleteMySubmissionFile,
  getMySubmission,
  saveMySubmissionNote,
} from "../actions/submissions";
import {
  type FileErrorKey,
  fileErrorKey,
  fileIcon,
  parseSubmission,
  SUBMISSION_NOTE_MAX,
  submissionFileHref,
  submissionUploadPath,
} from "../file-model";

type Load = { state: "loading" } | { state: "failed" } | { state: "ready" };

interface Limits {
  maxFiles: number;
  maxFileBytes: number;
}

/** A file on its way, or one that did not get there and why. */
interface Upload {
  key: number;
  name: string;
  state: "uploading" | "failed";
  error?: FileErrorKey;
}

/** What one upload came to. */
type Sent =
  | { kind: "added"; submission: LessonSubmissionResponse }
  | { kind: "refused"; error: FileErrorKey }
  | { kind: "signedOut" };

/**
 * One file through this app's route to tedrisat (MDRS-290): a multipart
 * `file`, the token added on the server. tedrisat's status and code come
 * back as they are; a session that is over goes to sign-in and back here.
 */
const send = async (lessonId: string, file: File): Promise<Sent> => {
  const body = new FormData();
  body.set("file", file, file.name);
  let response: Response;
  try {
    response = await fetch(submissionUploadPath(lessonId), {
      method: "POST",
      body,
    });
  } catch {
    return { kind: "refused", error: "failed" };
  }
  const json: unknown = await response.json().catch(() => null);
  if (response.status === 401 && sendToSignIn(json)) {
    return { kind: "signedOut" };
  }
  if (response.ok && json) {
    return { kind: "added", submission: parseSubmission(json) };
  }
  return {
    kind: "refused",
    error: fileErrorKey(
      response.status,
      (json as { code?: unknown } | null)?.code
    ),
  };
};

/**
 * "Ödevim" on a celse's detail page (MDRS-290): the talebe's own homework on
 * the celse, for a talebe who may hand it in (enrolled or completed, the
 * content open, the celse not cancelled; the page decides, tedrisat
 * enforces). It lists the files handed in, each downloaded through this app,
 * adds new ones (at most 5, 25 MB each, the types tedrisat takes; a file over
 * the size is refused here before it is sent) and removes one after asking,
 * and keeps an optional note. The müderris and the course team read it in
 * nazar. There is no deadline and no grade.
 */
export function SessionHomework({ lessonId }: { lessonId: string }) {
  const t = useTranslations("tedrisLearn.Homework");
  const locale = useLocale();
  const timeZone = useTimeZone();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [submission, setSubmission] = useState<LessonSubmissionResponse | null>(
    null
  );
  const [limits, setLimits] = useState<Limits>({
    maxFiles: MAX_SUBMISSION_FILES,
    maxFileBytes: MAX_FILE_BYTES,
  });
  const [uploads, setUploads] = useState<Upload[]>([]);
  // What a screen reader hears once a file is added or removed.
  const [status, setStatus] = useState("");
  const nextKey = useRef(0);

  const read = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoad({ state: "loading" });
      try {
        const result = await getMySubmission(lessonId);
        if (sendToSignIn(result)) return;
        if (result.success) {
          setSubmission(result.data.submission);
          setLimits({
            maxFiles: result.data.maxFiles || MAX_SUBMISSION_FILES,
            maxFileBytes: result.data.maxFileBytes || MAX_FILE_BYTES,
          });
          setLoad({ state: "ready" });
        } else if (!quiet) {
          setLoad({ state: "failed" });
        }
      } catch {
        if (!quiet) setLoad({ state: "failed" });
      }
    },
    [lessonId]
  );

  useEffect(() => {
    void read();
  }, [read]);

  const maxSize = formatFileSize(limits.maxFileBytes, locale);
  const errorText = (key: FileErrorKey) =>
    t(`errors.${key}`, { maxFiles: limits.maxFiles, maxSize });

  const files = submission?.files ?? [];
  const inFlight = uploads.filter((u) => u.state === "uploading").length;
  const full = files.length + inFlight >= limits.maxFiles;

  const settle = (key: number, change: Partial<Upload> | null) =>
    setUploads((all) =>
      change === null
        ? all.filter((u) => u.key !== key)
        : all.map((u) => (u.key === key ? { ...u, ...change } : u))
    );

  const add = async (chosen: File[]) => {
    if (chosen.length === 0) return;
    let room = limits.maxFiles - files.length - inFlight;
    const queued: Array<{ key: number; file: File }> = [];
    const entries: Upload[] = chosen.map((file) => {
      const key = nextKey.current++;
      // The server refuses these too; refused here, nothing is sent.
      const error: FileErrorKey | undefined =
        file.size > limits.maxFileBytes
          ? "tooLarge"
          : file.size === 0
            ? "empty"
            : room <= 0
              ? "limit"
              : undefined;
      if (error) return { key, name: file.name, state: "failed", error };
      room -= 1;
      queued.push({ key, file });
      return { key, name: file.name, state: "uploading" };
    });
    setUploads((all) => [...all, ...entries]);
    setStatus("");
    // One at a time, in the order chosen: the homework keeps that order.
    for (const { key, file } of queued) {
      const sent = await send(lessonId, file);
      if (sent.kind === "signedOut") return;
      if (sent.kind === "added") {
        setSubmission(sent.submission);
        settle(key, null);
        setStatus(t("added", { name: file.name }));
      } else {
        settle(key, { state: "failed", error: sent.error });
      }
    }
  };

  const updatedAt = submission
    ? new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: timeZone ?? "Europe/Istanbul",
      }).format(submission.updatedAt)
    : null;

  return (
    <section
      className="mds-card flex flex-col gap-4"
      aria-labelledby={`homework-${lessonId}`}
      data-testid="session-homework"
    >
      {/* One line: the card's name and, beside it, who reads it. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2
          className="mds-h3 flex items-center gap-2"
          id={`homework-${lessonId}`}
        >
          <Icon name="upload" />
          {t("title")}
        </h2>
        <p className="mds-caption">{t("audience")}</p>
      </div>

      {load.state === "loading" ? (
        <output className="mds-caption">{t("loading")}</output>
      ) : load.state === "failed" ? (
        <div className="flex flex-col gap-2" role="alert">
          <p className="mds-body-sm">{t("loadFailed")}</p>
          <div>
            <Button variant="outline" size="small" onClick={() => void read()}>
              {t("retry")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {files.length > 0 ? (
            <ul
              className="m-0 flex list-none flex-col p-0"
              aria-label={t("filesLabel")}
              data-testid="homework-files"
            >
              {files.map((file) => (
                <FileRow
                  key={file.id}
                  lessonId={lessonId}
                  file={file}
                  locale={locale}
                  errorText={errorText}
                  onRemoved={() => {
                    setSubmission((current) =>
                      current
                        ? {
                            ...current,
                            files: current.files.filter(
                              (f) => f.id !== file.id
                            ),
                          }
                        : current
                    );
                    setStatus(t("removed", { name: file.name }));
                    // The time it last changed is tedrisat's to say.
                    void read(true);
                  }}
                />
              ))}
            </ul>
          ) : uploads.length === 0 ? (
            <p className="mds-caption">{t("empty")}</p>
          ) : null}

          {uploads.length > 0 ? (
            <ul
              className="m-0 flex list-none flex-col gap-2 p-0"
              data-testid="homework-uploads"
            >
              {uploads.map((upload) => (
                <li key={upload.key} className="flex items-start gap-3">
                  <Icon
                    name={upload.state === "failed" ? "warning" : "upload"}
                    size="sm"
                  />
                  <span className="flex min-inline-0 flex-1 flex-col">
                    <bdi className="mds-label">{upload.name}</bdi>
                    {upload.state === "uploading" ? (
                      <span className="mds-caption" aria-busy="true">
                        {t("uploading")}
                      </span>
                    ) : (
                      <span className="mds-error" role="alert">
                        {errorText(upload.error ?? "failed")}
                      </span>
                    )}
                  </span>
                  {upload.state === "failed" ? (
                    <IconButton
                      size="mini"
                      icon={<Icon name="close" size="sm" />}
                      label={t("dismiss", { name: upload.name })}
                      onClick={() => settle(upload.key, null)}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          <Field
            label={t("addLabel")}
            help={
              full
                ? t("full", { maxFiles: limits.maxFiles })
                : t("limits", { maxFiles: limits.maxFiles, maxSize })
            }
          >
            <Input
              type="file"
              name="file"
              multiple
              accept={FILE_ACCEPT}
              disabled={full}
              onChange={(event) => {
                const chosen = [...(event.target.files ?? [])];
                // The same file may be chosen again after a refusal.
                event.target.value = "";
                void add(chosen);
              }}
            />
          </Field>

          <NoteForm
            lessonId={lessonId}
            saved={submission?.note ?? null}
            onSaved={setSubmission}
          />

          {submission && updatedAt ? (
            <p className="mds-caption">
              {t("updatedAt")}{" "}
              <time dateTime={submission.updatedAt.toISOString()}>
                {updatedAt}
              </time>
            </p>
          ) : null}

          <output className="mds-visually-hidden" aria-live="polite">
            {status}
          </output>
        </>
      )}
    </section>
  );
}

/**
 * One file handed in: its name as a download (through this app; a plain
 * link, so a refusal comes back to the page with `?fileError=` rather than
 * being saved as the file), its type and size under it, and a way to remove
 * it that asks first, as a note's delete does.
 */
const FileRow = ({
  lessonId,
  file,
  locale,
  errorText,
  onRemoved,
}: {
  lessonId: string;
  file: SubmissionFileResponse;
  locale: string;
  errorText: (key: FileErrorKey) => string;
  onRemoved: () => void;
}) => {
  const t = useTranslations("tedrisLearn.Homework");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const href = submissionFileHref(lessonId, file.id);
  const type = fileTypeChip(file.contentType);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await deleteMySubmissionFile(lessonId, file.id);
      if (sendToSignIn(result)) return;
      // Gone already (404) is what was asked for.
      if (result.success || ("status" in result && result.status === 404)) {
        return onRemoved();
      }
      const status = "status" in result ? result.status : undefined;
      setError(
        status === 403 || status === 503
          ? errorText(fileErrorKey(status))
          : t("removeFailed")
      );
    } catch {
      setError(t("removeFailed"));
    }
    setBusy(false);
  };

  const name = (
    <span className="mds-label" dir="auto">
      {file.name}
    </span>
  );
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 border-be border-neutral-subtle last:border-be-0">
      <Icon name={fileIcon(file.contentType)} size="sm" />
      <span className="flex min-inline-0 flex-1 flex-col">
        {href ? (
          <a className="mds-link" href={href}>
            {name}
            <span className="mds-visually-hidden">{t("download")}</span>
          </a>
        ) : (
          name
        )}
        <span className="flex flex-wrap items-center gap-2 mbs-1">
          {type ? <Badge variant="secondary">{type}</Badge> : null}
          <span className="mds-caption mds-num">
            {formatFileSize(file.sizeBytes, locale)}
          </span>
        </span>
      </span>
      {confirming ? (
        <span className="flex flex-wrap items-center justify-end gap-2">
          <span className="mds-caption">{t("removeAsk")}</span>
          <Button
            variant="destructive"
            size="mini"
            loading={busy}
            loadingLabel={t("removing")}
            onClick={() => void remove()}
          >
            {t("remove")}
          </Button>
          <Button
            variant="ghost"
            size="mini"
            onClick={() => {
              setConfirming(false);
              setError(null);
            }}
          >
            {t("cancel")}
          </Button>
        </span>
      ) : (
        <IconButton
          size="mini"
          icon={<Icon name="trash" size="sm" />}
          label={t("removeLabel", { name: file.name })}
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        />
      )}
      {error ? (
        <p className="mds-error basis-full" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
};

/**
 * The homework's note: optional, plain text, at most 4000 characters, saved
 * on its own. A blank one clears it. The count shows near the limit, as a
 * note's does.
 */
const NoteForm = ({
  lessonId,
  saved,
  onSaved,
}: {
  lessonId: string;
  saved: string | null;
  onSaved: (submission: LessonSubmissionResponse) => void;
}) => {
  const t = useTranslations("tedrisLearn.Homework");
  const [draft, setDraft] = useState(saved ?? "");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = draft.trim() !== (saved ?? "").trim();

  const submit = async () => {
    if (draft.trim().length > SUBMISSION_NOTE_MAX) {
      return setError(t("noteTooLong", { max: SUBMISSION_NOTE_MAX }));
    }
    setSaving(true);
    setError(null);
    setDone(false);
    try {
      const result = await saveMySubmissionNote(
        lessonId,
        draft.trim() === "" ? null : draft
      );
      if (sendToSignIn(result)) return;
      if (result.success) {
        onSaved(result.data);
        setDraft(result.data.note ?? "");
        setDone(true);
      } else {
        const status = "status" in result ? result.status : undefined;
        setError(
          status === 403
            ? t("errors.forbidden")
            : status === 400
              ? t("noteTooLong", { max: SUBMISSION_NOTE_MAX })
              : t("noteFailed")
        );
      }
    } catch {
      setError(t("noteFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field
        label={t("noteLabel")}
        help={
          // The count only in the last tenth before the limit, as a note's.
          draft.length >= SUBMISSION_NOTE_MAX * 0.9
            ? t("noteCount", {
                count: draft.length,
                max: SUBMISSION_NOTE_MAX,
              })
            : t("noteHelp")
        }
        invalid={Boolean(error)}
      >
        <Textarea
          rows={3}
          dir="auto"
          maxLength={SUBMISSION_NOTE_MAX}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setDone(false);
          }}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          size="small"
          variant="outline"
          disabled={!dirty}
          loading={saving}
          loadingLabel={t("noteSaving")}
        >
          {t("noteSave")}
        </Button>
        {done && !dirty ? (
          <output className="mds-caption">{t("noteSaved")}</output>
        ) : null}
      </div>
      {error ? (
        <p className="mds-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
};
