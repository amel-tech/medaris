"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { PlatformChip } from "@medaris/ui/mds/platform-chip";
import { Progress } from "@medaris/ui/mds/progress";
import { Switch } from "@medaris/ui/mds/switch";
import { Tabs, TabsPanel } from "@medaris/ui/mds/tabs";
import { useToaster } from "@medaris/ui/mds/toast";
import { useLocale, useTranslations } from "next-intl";
import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import type { Messages } from "~/lib/i18n/messages";
import { sendableLink } from "../../sessions/sessions";
import {
  addRecording,
  changeRecording,
  resignRecordingUpload,
  startRecordingUpload,
} from "../actions";
import {
  BunnyUpload,
  type FileProblem,
  fileProblem,
  MAX_UPLOAD_BYTES,
} from "../bunny-upload";
import {
  chipOf,
  createBody,
  formatBytes,
  formErrors,
  formOf,
  hostOf,
  newForm,
  patchBody,
  providerOfLink,
  type RecordingFact,
  recordingErrorKey,
  recordingsMoved,
  type SessionSlot,
  switchLocked,
  uploadBody,
  uploadContinues,
  uploadErrorKey,
  uploadMoved,
} from "../recordings";

/** What the caller holds of the two recording codes in this course. */
export interface RecordingAbilities {
  /** `recording.manage`: paste a link, edit a recording */
  manage: boolean;
  /** `recording.upload`: upload a video to Bunny, and continue it */
  upload: boolean;
}

type Tab = "upload" | "link";
type Step = "idle" | "signing" | "sending" | "stopped" | "failed";

/**
 * "Kayıt ekle", "Düzenle" and "Devam et" of a session.
 *
 * Adding has two tabs that share the title and "Herkese açık": "Bunny’ye
 * yükle", the default, for a holder of `recording.upload`, and "Bağlantı
 * yapıştır" for a holder of `recording.manage`; a caller who holds only one of
 * them sees that form alone. The upload sends the chosen video from the
 * browser to Bunny (`BunnyUpload`) with a progress bar; "İptal" stops it,
 * "Devam et" continues it where it stopped, with the same video signed again.
 * Once a video exists the file, the title and the tabs stay as they are: the
 * session's PROCESSING recording is that video. When Bunny has the whole
 * file the dialog closes and the page is read again; a stop or a refusal is
 * worded in the dialog from its code. "Devam et" on a session whose upload
 * was left halfway (a reload, another day) opens the upload alone, for the
 * same file picked again in the same browser.
 *
 * The paste form is today's: the provider chip appears as the link is typed
 * (a Bunny link, which has no chip of its own, shows its host), "Herkese açık"
 * starts off and a closed course opens nothing to everyone. Editing sends only
 * what changed. A refusal is worded from the API's code and, for a link
 * tedrisat cannot store, its reason; when it means the page is out of date,
 * the dialog closes and the page is read again.
 */
export function RecordingDialog({
  slot,
  can,
  resume = false,
  closed,
  onClose,
  onDone,
}: {
  slot: SessionSlot;
  can: RecordingAbilities;
  /** continue the session's halfway upload instead of adding or editing */
  resume?: boolean;
  /** the course is closed: nothing is opened to everyone */
  closed: boolean;
  onClose: () => void;
  /** called once something was written, or the page is out of date, for it to be read again */
  onDone: () => void;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const locale = useLocale();
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const editing: RecordingFact | null = resume ? null : slot.recording;
  const [form, setForm] = useState(() =>
    editing ? formOf(editing) : newForm(slot.title, t("Recordings.titleSuffix"))
  );
  const [sent, setSent] = useState(false);

  const uploadTab = resume || (!editing && can.upload);
  const linkTab = !resume && (editing !== null || can.manage);
  const [tab, setTab] = useState<Tab>(uploadTab ? "upload" : "link");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<FileProblem | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [progress, setProgress] = useState({ sent: 0, total: 0 });
  const [failure, setFailure] = useState<{
    code: string;
    reason: string | null;
  } | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const job = useRef<BunnyUpload | null>(null);
  const busy = step === "signing" || step === "sending";
  // once a video exists it is the session's recording: nothing else may be sent instead
  const locked = busy || videoId !== null;

  // A page left while the bytes go would drop the upload: the browser asks first.
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  // Leaving the page inside the app unmounts the dialog: the upload stops, and Bunny keeps what it got.
  useEffect(() => () => job.current?.abort(), []);

  const errors = formErrors(form);
  const provider = providerOfLink(form.url);
  const chip = chipOf(provider);
  const lock = switchLocked(form, closed);
  const showError = (problem: keyof typeof errors) =>
    sent && errors[problem] === true;
  const max = formatBytes(MAX_UPLOAD_BYTES, locale);

  const close = () => {
    onClose();
    // the session holds the video's recording now, "Hazırlanıyor"
    if (videoId !== null) onDone();
  };

  // A file with a problem marks its field invalid, and the kit's form is not
  // submitted while a field is: nothing is asked of tedrisat for it.
  const choose = (next: File | null) => {
    setFile(next);
    setFileError(next ? fileProblem(next) : null);
    if (videoId === null) {
      job.current = null;
      setStep("idle");
      setFailure(null);
      setProgress({ sent: 0, total: 0 });
    }
  };

  const upload = async () => {
    if (busy) return;
    if (!file) {
      setFileError("empty");
      return;
    }
    const body = uploadBody(form, slot);
    if (!body) {
      setSent(true);
      return;
    }
    if (!job.current) {
      job.current = new BunnyUpload({
        lessonId: slot.lessonId,
        file,
        // continuing, the recording already has its title
        title: (resume && slot.recording?.title) || body.title,
        start: () => startRecordingUpload(slot.lessonId, body),
        resign: (id) => resignRecordingUpload(slot.lessonId, id),
        resumeOnly: resume,
        onPhase: setStep,
        onProgress: (bytesSent, bytesTotal) =>
          setProgress({ sent: bytesSent, total: bytesTotal }),
      });
    }
    setFailure(null);
    const outcome = await job.current.run();
    setVideoId(outcome.videoId);
    if (outcome.status === "done") {
      notify({
        title: t("Recordings.upload.done"),
        description: t("Recordings.upload.doneBody", { session: slot.title }),
      });
      onClose();
      onDone();
      return;
    }
    if (outcome.status === "aborted") {
      setStep("stopped");
      return;
    }
    setStep("failed");
    setFailure({ code: outcome.code, reason: outcome.reason ?? null });
    // nothing was made: the next "Yükle" starts over, with any file
    if (outcome.videoId === null) job.current = null;
    if (uploadMoved(outcome.code)) onDone();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (uploadTab && tab === "upload") {
      void upload();
      return;
    }
    if (pending) return;
    if (Object.keys(errors).length > 0) {
      setSent(true);
      return;
    }
    const patch = editing ? patchBody(form, editing) : null;
    const create = editing ? null : createBody(form);
    if (!patch && !create) {
      // nothing changed
      onClose();
      return;
    }
    startTransition(async () => {
      const result =
        editing && patch
          ? await changeRecording(editing.id, patch)
          : create
            ? await addRecording(slot.lessonId, create)
            : null;
      if (!result) return;
      if (!result.success) {
        notify({
          tone: "error",
          title: t("Recordings.failed"),
          description: words(
            recordingErrorKey(result.code, result.reason ?? null)
          ),
        });
        if (recordingsMoved(result.code)) {
          onClose();
          onDone();
        }
        return;
      }
      notify(
        editing
          ? {
              title: t("Recordings.saved"),
              description: t("Recordings.savedBody", {
                title: form.title.trim(),
              }),
            }
          : {
              title: t("Recordings.added"),
              description: t("Recordings.addedBody", { session: slot.title }),
            }
      );
      onClose();
      onDone();
    });
  };

  const continues =
    resume ||
    step === "stopped" ||
    (step === "failed" &&
      failure !== null &&
      uploadContinues(failure.code, videoId));
  // tedrisat would not sign the video again: there is nothing left to send
  const dead = step === "failed" && videoId !== null && !continues;
  const percent =
    progress.total > 0 ? Math.floor((progress.sent / progress.total) * 100) : 0;

  const uploadFooter = busy ? (
    <Button variant="outline" onClick={() => job.current?.abort()}>
      {t("Recordings.upload.cancel")}
    </Button>
  ) : (
    <>
      <DialogClose>{t("Recordings.form.cancel")}</DialogClose>
      {dead ? null : (
        <Button type="submit">
          {t(
            continues ? "Recordings.upload.resume" : "Recordings.upload.submit"
          )}
        </Button>
      )}
    </>
  );
  const linkFooter = (
    <>
      <DialogClose>{t("Recordings.form.cancel")}</DialogClose>
      <Button type="submit" loading={pending}>
        {t(
          editing ? "Recordings.form.submitEdit" : "Recordings.form.submitAdd"
        )}
      </Button>
    </>
  );

  const uploadPanel = (
    <>
      <Field
        label={t("Recordings.upload.fileLabel")}
        required
        help={t("Recordings.upload.fileHelp", { max })}
        error={
          fileError
            ? words(`Recordings.upload.errors.${fileError}`, { max })
            : undefined
        }
      >
        <Input
          type="file"
          name="file"
          accept="video/*"
          disabled={locked}
          onChange={(event) => choose(event.target.files?.[0] ?? null)}
        />
      </Field>
      {file ? (
        <p className="mds-caption" data-testid="upload-file">
          <bdi>
            {t("Recordings.upload.chosen", {
              name: file.name,
              size: formatBytes(file.size, locale),
            })}
          </bdi>
        </p>
      ) : null}
      {step === "signing" ? (
        <output className="mds-body-sm">
          {t("Recordings.upload.signing")}
        </output>
      ) : null}
      {progress.total > 0 && step !== "idle" && step !== "signing" ? (
        <div className="flex flex-col gap-1" data-testid="upload-progress">
          <Progress
            value={percent}
            label={t("Recordings.upload.progressLabel")}
            showValue
            completeLabel={t("Recordings.upload.progressDone")}
            locale={locale}
          />
          <p className="mds-caption">
            {t("Recordings.upload.progressBytes", {
              sent: formatBytes(progress.sent, locale),
              total: formatBytes(progress.total, locale),
            })}
          </p>
        </div>
      ) : null}
      {step === "stopped" ? (
        <Alert tone="info">
          <p>{t("Recordings.upload.aborted")}</p>
        </Alert>
      ) : null}
      {step === "failed" && failure ? (
        <Alert tone="error" title={t("Recordings.upload.failedTitle")}>
          <p>{words(uploadErrorKey(failure.code, failure.reason))}</p>
        </Alert>
      ) : null}
    </>
  );

  const linkField = (
    <Field
      label={
        <span className="flex w-full items-center justify-between gap-2">
          {t("Recordings.form.linkLabel")}
          {chip ? (
            <PlatformChip
              platform={chip}
              kind="recording"
              detected
              detectedLabel={t("Recordings.form.detected")}
            />
          ) : provider === "BUNNY" ? (
            <PlatformChip
              platform="bunny"
              kind="recording"
              host={hostOf(sendableLink(form.url) ?? "")}
              detected
              detectedLabel={t("Recordings.form.detected")}
            />
          ) : null}
        </span>
      }
      required
      help={t("Recordings.form.linkHelp")}
      error={
        showError("linkEmpty")
          ? t("Recordings.form.errors.linkEmpty")
          : showError("link")
            ? t("Recordings.form.errors.link")
            : undefined
      }
    >
      <Input
        mono
        name="url"
        placeholder="https://…"
        autoComplete="off"
        spellCheck={false}
        value={form.url}
        disabled={pending}
        onChange={(event) => setForm({ ...form, url: event.target.value })}
      />
    </Field>
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending && !busy) close();
      }}
      form
      onSubmit={submit}
      eyebrow={slot.title}
      title={t(
        resume
          ? "Recordings.upload.resumeTitle"
          : editing
            ? "Recordings.form.editTitle"
            : "Recordings.form.addTitle"
      )}
      closeLabel={t("Shell.close")}
      footer={uploadTab && tab === "upload" ? uploadFooter : linkFooter}
    >
      {resume ? (
        <p className="mds-body-sm">{t("Recordings.upload.resumeHelp")}</p>
      ) : (
        <Field
          label={t("Recordings.form.titleLabel")}
          required
          error={
            showError("title") ? t("Recordings.form.errors.title") : undefined
          }
        >
          <Input
            name="title"
            value={form.title}
            maxLength={200}
            disabled={pending || locked}
            onChange={(event) =>
              setForm({ ...form, title: event.target.value })
            }
          />
        </Field>
      )}
      {uploadTab && linkTab ? (
        <Tabs
          label={t("Recordings.upload.tabsLabel")}
          value={tab}
          onChange={(next) => {
            if (!locked && !pending) setTab(next as Tab);
          }}
          tabs={[
            { value: "upload", label: t("Recordings.upload.tabUpload") },
            { value: "link", label: t("Recordings.upload.tabLink") },
          ]}
        >
          <TabsPanel value="upload" className="flex flex-col gap-4 pbs-4">
            {uploadPanel}
          </TabsPanel>
          <TabsPanel value="link" className="flex flex-col gap-4 pbs-4">
            {linkField}
          </TabsPanel>
        </Tabs>
      ) : uploadTab ? (
        uploadPanel
      ) : (
        linkField
      )}
      {resume ? null : (
        <Switch
          label={t("Recordings.form.publicLabel")}
          description={
            lock.reason === "closed"
              ? t("Recordings.form.closed")
              : t("Recordings.form.publicHelp")
          }
          checked={form.isPublic}
          disabled={pending || locked || lock.locked}
          onCheckedChange={(checked) => setForm({ ...form, isPublic: checked })}
        />
      )}
    </Dialog>
  );
}
