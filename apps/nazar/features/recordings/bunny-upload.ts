/**
 * Sending a session's video from the browser to Bunny Stream over TUS
 * (MDRS-114, the screen half of MDRS-116 part A). tedrisat creates the video
 * and signs its upload (`POST /lessons/:id/recordings/uploads`); the file goes
 * from here straight to Bunny and never through tedrisat, and the library's
 * API key never reaches the browser.
 *
 * The signature and its expiry live in this object's memory only: they are
 * set on each request (`onBeforeRequest`), never in tus's options, never
 * logged and never stored. What tus keeps in the browser's storage to resume
 * after a reload is the upload's address, its size and metadata (the file
 * type and the title), and, added here, the id of the Bunny video it fills,
 * which is what the re-sign route asks for.
 *
 * Resuming: a second `run()` of the same object (after "İptal" or a dropped
 * connection) asks tedrisat to sign the SAME video again and lets tus continue
 * from the offset Bunny reports. A new object for the same session and the
 * same file finds the earlier upload in tus's storage, asks for its signature
 * again and continues it there (`findUploadsByFingerprint`,
 * `resumeFromPreviousUpload`). A re-sign keeps the upload's original expiry
 * (Bunny never extends it), so past 24 hours tedrisat refuses and the upload
 * cannot be continued.
 *
 * tus-js-client is loaded when an upload starts, not with the page; a spec
 * hands in its own `Upload` instead.
 */

/** What Bunny's TUS endpoint needs, as tedrisat answers it. */
export interface UploadGrant {
  endpoint: string;
  libraryId: string;
  videoId: string;
  /** unix seconds; the end of the upload's lifetime, never moved by a re-sign */
  authorizationExpire: number;
  authorizationSignature: string;
}

/** A server action's answer: the grant, or the API's refusal code (and its reason). */
export type GrantOutcome =
  | { success: true; data: UploadGrant }
  | { success: false; code: string; reason?: string };

/** How a run ended. `videoId` is the video it filled, once tedrisat made one. */
export type UploadOutcome =
  | { status: "done"; videoId: string }
  | { status: "aborted"; videoId: string | null }
  | {
      status: "failed";
      code: string;
      reason?: string;
      videoId: string | null;
    };

/** One entry of tus's upload storage; `videoId` is this module's addition. */
export interface StoredUpload {
  size: number | null;
  metadata: Record<string, string>;
  creationTime: string;
  urlStorageKey: string;
  uploadUrl: string | null;
  parallelUploadUrls: string[] | null;
  videoId?: string;
}

/** tus-js-client's `UrlStorage`. */
export interface UploadStore {
  findAllUploads(): Promise<StoredUpload[]>;
  findUploadsByFingerprint(fingerprint: string): Promise<StoredUpload[]>;
  removeUpload(urlStorageKey: string): Promise<void>;
  addUpload(fingerprint: string, upload: StoredUpload): Promise<string>;
}

/** What an HTTP request and response of tus offer to this module. */
interface TusRequest {
  setHeader(header: string, value: string): void;
}

/** The options this module gives tus's `Upload`. */
export interface TusOptions {
  endpoint: string;
  metadata: Record<string, string>;
  chunkSize: number;
  retryDelays: number[];
  fingerprint: () => Promise<string>;
  urlStorage: UploadStore;
  storeFingerprintForResuming: boolean;
  removeFingerprintOnSuccess: boolean;
  onBeforeRequest: (request: TusRequest) => void;
  onProgress: (bytesSent: number, bytesTotal: number) => void;
  onSuccess: () => void;
  onError: (error: Error) => void;
}

/** What this module uses of tus's `Upload`. */
export interface TusUpload {
  start(): void;
  abort(shouldTerminate?: boolean): Promise<void>;
  resumeFromPreviousUpload(previous: StoredUpload): void;
}

/** tus-js-client as this module uses it; a spec passes a stub. */
export interface TusClient {
  Upload: new (file: File, options: TusOptions) => TusUpload;
  defaultOptions: { urlStorage?: UploadStore };
}

/**
 * Chunks of 50 MiB: a dropped connection sends at most one chunk again, and
 * each request stays well under the 100 MB body that proxies in front of an
 * upload endpoint commonly refuse.
 */
export const UPLOAD_CHUNK_BYTES = 50 * 1024 * 1024;

/**
 * tus retries a request that failed without a client error after each of
 * these waits (about two minutes in all), and starts over from the first once
 * a chunk got through. A refusal (Bunny's 401 for a bad signature) is not
 * retried.
 */
export const UPLOAD_RETRY_DELAYS_MS = [
  0, 1_000, 3_000, 5_000, 10_000, 20_000, 30_000, 60_000,
];

/**
 * 10 GB: two hours recorded at a high bitrate (about 10 Mbit/s) is about
 * 9 GB, so a larger file is most likely not a session's recording, or one to
 * compress first; and the upload has to finish within the 24 hours its
 * signature lives. Bunny itself takes larger files.
 */
export const MAX_UPLOAD_BYTES = 10_000_000_000;

/** Video files a browser may hand over with no type at all (Matroska on Windows, for one). */
const VIDEO_EXTENSIONS: Record<string, string> = {
  mkv: "video/x-matroska",
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  webm: "video/webm",
  avi: "video/x-msvideo",
  wmv: "video/x-ms-wmv",
  flv: "video/x-flv",
  ts: "video/mp2t",
  mpg: "video/mpeg",
  mpeg: "video/mpeg",
  "3gp": "video/3gpp",
};

/** The file's video type, from the browser or else from its extension; null when it is no video. */
export function videoTypeOf(file: Pick<File, "name" | "type">): string | null {
  if (file.type) return file.type.startsWith("video/") ? file.type : null;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return Object.hasOwn(VIDEO_EXTENSIONS, extension)
    ? VIDEO_EXTENSIONS[extension]
    : null;
}

export type FileProblem = "type" | "size" | "empty";

/** What is wrong with a chosen file before anything is asked of tedrisat, or null. */
export function fileProblem(
  file: Pick<File, "name" | "type" | "size">
): FileProblem | null {
  if (videoTypeOf(file) === null) return "type";
  if (file.size === 0) return "empty";
  if (file.size > MAX_UPLOAD_BYTES) return "size";
  return null;
}

/** The headers Bunny reads the authorization from, on every TUS request. */
export function tusHeaders(grant: UploadGrant): Record<string, string> {
  return {
    AuthorizationSignature: grant.authorizationSignature,
    AuthorizationExpire: String(grant.authorizationExpire),
    VideoId: grant.videoId,
    LibraryId: grant.libraryId,
  };
}

/**
 * The key tus stores an upload under: the session and the file as the browser
 * describes it. The same file picked again for the same session finds it; the
 * same file for another session does not.
 */
export const uploadFingerprint = (
  lessonId: string,
  file: Pick<File, "name" | "type" | "size" | "lastModified">
): string =>
  [
    "medaris-bunny",
    lessonId,
    encodeURIComponent(file.name),
    file.type,
    file.size,
    file.lastModified,
  ].join("-");

/**
 * The code of an upload that failed on Bunny's side: refused (401 or 403,
 * a signature it does not take), no answer at all (the connection), or
 * anything else.
 */
export function tusFailureCode(error: unknown): string {
  const detail = error as {
    originalRequest?: unknown;
    originalResponse?: { getStatus(): number } | null;
  } | null;
  const status = detail?.originalResponse?.getStatus();
  if (status === 401 || status === 403) return "UPLOAD_REFUSED";
  if (status === undefined && detail?.originalRequest) return "UPLOAD_NETWORK";
  return "UPLOAD_FAILED";
}

/** A re-sign refusal after which the stored upload can never be continued. */
const UPLOAD_CLOSED = new Set([
  "RECORDING_UPLOAD_CLOSED",
  "RECORDING_UPLOAD_NOT_FOUND",
]);

/** A store that keeps nothing, when the browser has none. */
const NO_STORE: UploadStore = {
  findAllUploads: async () => [],
  findUploadsByFingerprint: async () => [],
  removeUpload: async () => {},
  addUpload: async () => "",
};

const loadTus = async (): Promise<TusClient> => await import("tus-js-client");

export interface BunnyUploadOptions {
  lessonId: string;
  file: File;
  /** the recording's title, sent to Bunny as the video's */
  title: string;
  /** starts the upload in tedrisat: a new video and its signature */
  start: () => Promise<GrantOutcome>;
  /** signs the same video again */
  resign: (videoId: string) => Promise<GrantOutcome>;
  /** continue an upload this browser began, and never start a new one */
  resumeOnly?: boolean;
  onProgress?: (bytesSent: number, bytesTotal: number) => void;
  /** "signing" while tedrisat is asked, "sending" once the bytes go */
  onPhase?: (phase: "signing" | "sending") => void;
  tus?: TusClient;
}

/**
 * One file's upload to one session. `run()` signs and sends, and resolves
 * when Bunny has the whole file, when it failed, or when `abort()` stopped
 * it; `run()` again continues where it stopped.
 */
export class BunnyUpload {
  private grant: UploadGrant | null = null;
  private upload: TusUpload | null = null;
  private previous: StoredUpload | null = null;
  private settle: ((outcome: UploadOutcome) => void) | null = null;
  private stopped = false;
  private readonly options: BunnyUploadOptions;

  constructor(options: BunnyUploadOptions) {
    this.options = options;
  }

  /** The Bunny video this upload fills, once tedrisat made or named one. */
  get videoId(): string | null {
    return this.grant?.videoId ?? null;
  }

  async run(): Promise<UploadOutcome> {
    this.stopped = false;
    const tus = this.options.tus ?? (await loadTus());
    const store = tus.defaultOptions.urlStorage ?? NO_STORE;
    const fingerprint = uploadFingerprint(
      this.options.lessonId,
      this.options.file
    );

    this.options.onPhase?.("signing");
    let signed: GrantOutcome | null;
    try {
      signed = await this.sign(store, fingerprint);
    } catch {
      // the server action itself did not answer
      signed = { success: false, code: "UPLOAD_NETWORK" };
    }
    if (signed === null) {
      return { status: "failed", code: "UPLOAD_NOT_FOUND", videoId: null };
    }
    if (!signed.success) {
      return {
        status: "failed",
        code: signed.code,
        ...(signed.reason ? { reason: signed.reason } : {}),
        videoId: this.videoId,
      };
    }
    this.grant = signed.data;
    if (this.stopped) return { status: "aborted", videoId: this.videoId };

    this.options.onPhase?.("sending");
    return new Promise<UploadOutcome>((resolve) => {
      this.settle = resolve;
      if (!this.upload) {
        this.upload = new tus.Upload(
          this.options.file,
          this.tusOptions(store, fingerprint)
        );
        if (this.previous) this.upload.resumeFromPreviousUpload(this.previous);
      }
      this.upload.start();
    });
  }

  /** Stops the upload; Bunny keeps what it received, so `run()` can continue it. */
  abort(): void {
    this.stopped = true;
    void this.upload?.abort(false);
    this.finish({ status: "aborted", videoId: this.videoId });
  }

  /**
   * The signature to send with: the same video's again when this object
   * already has one, else an earlier upload of this file to this session
   * found in tus's storage, else a new upload. Null when only a resume was
   * asked for and there is nothing to resume.
   */
  private async sign(
    store: UploadStore,
    fingerprint: string
  ): Promise<GrantOutcome | null> {
    if (this.grant) return this.options.resign(this.grant.videoId);
    const earlier = await this.storedUpload(store, fingerprint);
    if (earlier?.videoId) {
      const again = await this.options.resign(earlier.videoId);
      if (again.success) {
        this.previous = earlier;
        return again;
      }
      if (!UPLOAD_CLOSED.has(again.code)) return again;
      // that upload can never be continued: forget it
      await store.removeUpload(earlier.urlStorageKey).catch(() => {});
      if (this.options.resumeOnly) return again;
    }
    if (this.options.resumeOnly) return null;
    return this.options.start();
  }

  /** The newest stored upload of this file to this session that names its video. */
  private async storedUpload(
    store: UploadStore,
    fingerprint: string
  ): Promise<StoredUpload | null> {
    let found: StoredUpload[];
    try {
      found = await store.findUploadsByFingerprint(fingerprint);
    } catch {
      // a storage the browser refuses is no earlier upload
      return null;
    }
    return (
      found
        .filter((entry) => entry.videoId && entry.uploadUrl)
        .sort((a, b) => Date.parse(a.creationTime) - Date.parse(b.creationTime))
        .pop() ?? null
    );
  }

  private tusOptions(store: UploadStore, fingerprint: string): TusOptions {
    const { file, title } = this.options;
    return {
      endpoint: this.grant?.endpoint ?? "",
      metadata: { filetype: videoTypeOf(file) ?? file.type, title },
      chunkSize: UPLOAD_CHUNK_BYTES,
      retryDelays: UPLOAD_RETRY_DELAYS_MS,
      fingerprint: async () => fingerprint,
      urlStorage: {
        findAllUploads: () => store.findAllUploads(),
        findUploadsByFingerprint: (key) => store.findUploadsByFingerprint(key),
        removeUpload: (key) => store.removeUpload(key),
        // the video id goes with the stored address, so a reload can ask to re-sign it
        addUpload: (key, upload) =>
          store.addUpload(key, {
            ...upload,
            videoId: this.videoId ?? undefined,
          }),
      },
      storeFingerprintForResuming: true,
      removeFingerprintOnSuccess: true,
      // read on every request, so a re-sign is what the next one carries
      onBeforeRequest: (request) => {
        if (!this.grant) return;
        for (const [name, value] of Object.entries(tusHeaders(this.grant))) {
          request.setHeader(name, value);
        }
      },
      onProgress: (sent, total) => this.options.onProgress?.(sent, total),
      onSuccess: () =>
        this.finish({ status: "done", videoId: this.videoId ?? "" }),
      onError: (error) =>
        this.finish({
          status: "failed",
          code: tusFailureCode(error),
          videoId: this.videoId,
        }),
    };
  }

  private finish(outcome: UploadOutcome): void {
    const settle = this.settle;
    this.settle = null;
    settle?.(outcome);
  }
}
