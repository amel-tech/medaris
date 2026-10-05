import { describe, expect, it, vi } from "vitest";
import {
  BunnyUpload,
  type BunnyUploadOptions,
  fileProblem,
  type GrantOutcome,
  MAX_UPLOAD_BYTES,
  type StoredUpload,
  type TusClient,
  type TusOptions,
  tusFailureCode,
  tusHeaders,
  UPLOAD_CHUNK_BYTES,
  type UploadGrant,
  type UploadStore,
  uploadFingerprint,
  videoTypeOf,
} from "~/features/recordings/bunny-upload";

/**
 * The browser's upload to Bunny Stream, with tus-js-client and tedrisat's two
 * upload routes stubbed: what it asks tedrisat, what it hands tus, what tus
 * keeps in the browser's storage, and how a stop, a refusal and a resume
 * end. Nothing reaches Bunny or tedrisat.
 */

const grant = (over: Partial<UploadGrant> = {}): UploadGrant => ({
  endpoint: "https://video.bunnycdn.com/tusupload",
  libraryId: "424242",
  videoId: "v-1",
  authorizationExpire: 1_791_300_000,
  authorizationSignature: "a".repeat(64),
  ...over,
});
const ok = (data: UploadGrant): GrantOutcome => ({ success: true, data });

/** tus's `Upload`, recording what it was given and done to; a spec drives its callbacks. */
class FakeUpload {
  static made: FakeUpload[] = [];
  starts = 0;
  aborts: Array<boolean | undefined> = [];
  resumedFrom: StoredUpload | null = null;
  constructor(
    readonly file: File,
    readonly options: TusOptions
  ) {
    FakeUpload.made.push(this);
  }
  start() {
    this.starts += 1;
  }
  abort(shouldTerminate?: boolean) {
    this.aborts.push(shouldTerminate);
    return Promise.resolve();
  }
  resumeFromPreviousUpload(previous: StoredUpload) {
    this.resumedFrom = previous;
  }
  /** The headers the next request would carry. */
  headers() {
    const sent: Record<string, string> = {};
    this.options.onBeforeRequest({
      setHeader: (name, value) => {
        sent[name] = value;
      },
    });
    return sent;
  }
  /** What tus does once Bunny answered the creation: it stores the upload's address. */
  async created(uploadUrl: string) {
    const fingerprint = await this.options.fingerprint();
    await this.options.urlStorage.addUpload(fingerprint, {
      size: this.file.size,
      metadata: this.options.metadata,
      creationTime: new Date().toString(),
      urlStorageKey: "",
      uploadUrl,
      parallelUploadUrls: null,
    });
  }
}

/** tus's browser storage, in memory: key → entry, as `WebStorageUrlStorage` keeps them. */
const memoryStore = () => {
  const entries = new Map<string, string>();
  let next = 0;
  const store: UploadStore = {
    findAllUploads: async () =>
      [...entries].map(([key, value]) => ({
        ...JSON.parse(value),
        urlStorageKey: key,
      })),
    findUploadsByFingerprint: async (fingerprint) =>
      [...entries]
        .filter(([key]) => key.startsWith(`tus::${fingerprint}::`))
        .map(([key, value]) => ({ ...JSON.parse(value), urlStorageKey: key })),
    removeUpload: async (key) => {
      entries.delete(key);
    },
    addUpload: async (fingerprint, upload) => {
      next += 1;
      const key = `tus::${fingerprint}::${next}`;
      entries.set(key, JSON.stringify(upload));
      return key;
    },
  };
  return { store, entries };
};

const video = ({
  bytes = 4096,
  lastModified = 1_790_000_000_000,
}: {
  bytes?: number;
  lastModified?: number;
} = {}) =>
  new File([new Uint8Array(bytes)], "celse-3.mp4", {
    type: "video/mp4",
    lastModified,
  });

const setup = (over: Partial<BunnyUploadOptions> = {}) => {
  FakeUpload.made = [];
  const { store, entries } = memoryStore();
  const tus: TusClient = {
    Upload: FakeUpload,
    defaultOptions: { urlStorage: store },
  };
  const start = vi.fn(async () => ok(grant()));
  const resign = vi.fn(async (videoId: string) =>
    ok(grant({ videoId, authorizationSignature: "b".repeat(64) }))
  );
  const progress = vi.fn();
  const options: BunnyUploadOptions = {
    lessonId: "l-1",
    file: video(),
    title: "Hafta 1 kaydı",
    start,
    resign,
    onProgress: progress,
    tus,
    ...over,
  };
  return { options, store, entries, start, resign, progress };
};

/** Lets the run reach tus: the sign step is a few awaits. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const tusOf = () => FakeUpload.made.at(-1) as FakeUpload;

describe("what is sent with the bytes", () => {
  it("carries the four authorization headers Bunny reads, the expiry as text", () => {
    expect(tusHeaders(grant())).toEqual({
      AuthorizationSignature: "a".repeat(64),
      AuthorizationExpire: "1791300000",
      VideoId: "v-1",
      LibraryId: "424242",
    });
  });

  it("stores an upload by the session and the file, so the same file for another session is another upload", () => {
    const file = video();
    expect(uploadFingerprint("l-1", file)).toBe(uploadFingerprint("l-1", file));
    expect(uploadFingerprint("l-1", file)).not.toBe(
      uploadFingerprint("l-2", file)
    );
    expect(uploadFingerprint("l-1", file)).not.toBe(
      uploadFingerprint("l-1", video({ bytes: 1 }))
    );
  });
});

describe("the file", () => {
  it("takes a video, by its type or, when the browser gives none, by its extension", () => {
    expect(fileProblem(video())).toBeNull();
    expect(videoTypeOf({ name: "ders.MKV", type: "" })).toBe(
      "video/x-matroska"
    );
    expect(fileProblem({ name: "ders.mkv", type: "", size: 10 })).toBeNull();
    expect(fileProblem({ name: "notlar.pdf", type: "", size: 10 })).toBe(
      "type"
    );
    expect(
      fileProblem({ name: "kapak.png", type: "image/png", size: 10 })
    ).toBe("type");
    // a type the browser gives wins over the name
    expect(
      fileProblem({ name: "celse.mp4", type: "audio/mpeg", size: 10 })
    ).toBe("type");
  });

  it("refuses an empty file and one over the limit, and takes one exactly at it", () => {
    const at = (size: number) =>
      fileProblem({ name: "c.mp4", type: "video/mp4", size });
    expect(at(0)).toBe("empty");
    expect(at(MAX_UPLOAD_BYTES)).toBeNull();
    expect(at(MAX_UPLOAD_BYTES + 1)).toBe("size");
  });
});

describe("starting an upload", () => {
  it("asks tedrisat to start it, then hands tus the endpoint, the file's type and title, chunks and retries", async () => {
    const phases: string[] = [];
    const { options, start, resign } = setup({
      onPhase: (phase) => phases.push(phase),
    });
    new BunnyUpload(options).run();
    await flush();
    expect(phases).toEqual(["signing", "sending"]);
    expect(start).toHaveBeenCalledTimes(1);
    expect(resign).not.toHaveBeenCalled();
    const tus = tusOf();
    expect(tus.starts).toBe(1);
    expect(tus.file).toBe(options.file);
    expect(tus.options.endpoint).toBe("https://video.bunnycdn.com/tusupload");
    expect(tus.options.metadata).toEqual({
      filetype: "video/mp4",
      title: "Hafta 1 kaydı",
    });
    expect(tus.options.chunkSize).toBe(UPLOAD_CHUNK_BYTES);
    expect(tus.options.retryDelays.length).toBeGreaterThan(3);
    expect(tus.options.retryDelays).toEqual(
      [...tus.options.retryDelays].sort((a, b) => a - b)
    );
    expect(tus.options.removeFingerprintOnSuccess).toBe(true);
    expect(tus.resumedFrom).toBeNull();
  });

  it("sends the signature on each request, never in tus's options", async () => {
    const { options } = setup();
    new BunnyUpload(options).run();
    await flush();
    const tus = tusOf();
    expect(tus.headers()).toEqual(tusHeaders(grant()));
    expect(JSON.stringify(tus.options)).not.toContain("a".repeat(64));
  });

  it("reports the bytes sent, and ends done when Bunny has the whole file", async () => {
    const { options, progress } = setup();
    const run = new BunnyUpload(options).run();
    await flush();
    tusOf().options.onProgress(1024, 4096);
    tusOf().options.onProgress(4096, 4096);
    tusOf().options.onSuccess();
    expect(await run).toEqual({ status: "done", videoId: "v-1" });
    expect(progress.mock.calls).toEqual([
      [1024, 4096],
      [4096, 4096],
    ]);
  });

  it("stores the upload's address with its video for a later resume, and never the signature or its expiry", async () => {
    const { options, entries } = setup();
    new BunnyUpload(options).run();
    await flush();
    await tusOf().created("https://video.bunnycdn.com/tusupload/abc");
    const [stored] = [...entries.values()];
    expect(JSON.parse(stored)).toMatchObject({
      uploadUrl: "https://video.bunnycdn.com/tusupload/abc",
      videoId: "v-1",
    });
    expect(stored).not.toContain("a".repeat(64));
    expect(stored).not.toContain("1791300000");
  });

  it("does not reach tus when tedrisat refuses, and keeps the refusal's code and reason", async () => {
    for (const refusal of [
      { success: false as const, code: "BUNNY_STREAM_NOT_CONFIGURED" },
      { success: false as const, code: "RECORDING_EXISTS" },
      { success: false as const, code: "AUTHZ_FORBIDDEN" },
    ]) {
      const { options } = setup({ start: async () => refusal });
      expect(await new BunnyUpload(options).run()).toEqual({
        status: "failed",
        code: refusal.code,
        videoId: null,
      });
      expect(FakeUpload.made).toHaveLength(0);
    }
  });

  it("takes a server action that does not answer for a dropped connection", async () => {
    const { options } = setup({
      start: async () => {
        throw new Error("fetch failed");
      },
    });
    expect(await new BunnyUpload(options).run()).toEqual({
      status: "failed",
      code: "UPLOAD_NETWORK",
      videoId: null,
    });
  });
});

describe("İptal, and Devam et", () => {
  it("stops tus without deleting what Bunny received, and ends aborted with the video", async () => {
    const { options } = setup();
    const upload = new BunnyUpload(options);
    const run = upload.run();
    await flush();
    upload.abort();
    expect(await run).toEqual({ status: "aborted", videoId: "v-1" });
    expect(tusOf().aborts).toEqual([false]);
  });

  it("continues the same tus upload after a stop, with the same video signed again, and starts nothing new", async () => {
    const { options, start, resign } = setup();
    const upload = new BunnyUpload(options);
    const first = upload.run();
    await flush();
    upload.abort();
    await first;
    const again = upload.run();
    await flush();
    expect(start).toHaveBeenCalledTimes(1);
    expect(resign).toHaveBeenCalledWith("v-1");
    expect(FakeUpload.made).toHaveLength(1);
    expect(tusOf().starts).toBe(2);
    // the next request carries the fresh signature
    expect(tusOf().headers().AuthorizationSignature).toBe("b".repeat(64));
    tusOf().options.onSuccess();
    expect(await again).toEqual({ status: "done", videoId: "v-1" });
  });

  it("does not start tus when stopped while tedrisat is still asked", async () => {
    let answer: (outcome: GrantOutcome) => void = () => {};
    const { options } = setup({
      start: () =>
        new Promise<GrantOutcome>((resolve) => {
          answer = resolve;
        }),
    });
    const upload = new BunnyUpload(options);
    const run = upload.run();
    await flush();
    upload.abort();
    answer(ok(grant()));
    expect(await run).toEqual({ status: "aborted", videoId: "v-1" });
    expect(FakeUpload.made).toHaveLength(0);
  });
});

describe("a resume after a reload", () => {
  /** A first upload of the file to session l-1 that reached Bunny and stopped. */
  const halfway = async () => {
    const first = setup();
    const upload = new BunnyUpload(first.options);
    const run = upload.run();
    await flush();
    await tusOf().created("https://video.bunnycdn.com/tusupload/abc");
    upload.abort();
    await run;
    return first;
  };

  it("finds the earlier upload of the same file, asks to sign its video again and continues it there", async () => {
    const { store, entries } = await halfway();
    const second = setup({ tus: undefined });
    second.options.tus = {
      Upload: FakeUpload,
      defaultOptions: { urlStorage: store },
    };
    FakeUpload.made = [];
    const run = new BunnyUpload({ ...second.options, resumeOnly: true }).run();
    await flush();
    expect(second.start).not.toHaveBeenCalled();
    expect(second.resign).toHaveBeenCalledWith("v-1");
    const tus = tusOf();
    expect(tus.resumedFrom).toMatchObject({
      uploadUrl: "https://video.bunnycdn.com/tusupload/abc",
      videoId: "v-1",
      urlStorageKey: [...entries.keys()][0],
    });
    expect(tus.headers().AuthorizationSignature).toBe("b".repeat(64));
    tus.options.onSuccess();
    expect(await run).toEqual({ status: "done", videoId: "v-1" });
  });

  it("finds nothing for another file, or for the same file of another session", async () => {
    const { store } = await halfway();
    for (const [lessonId, file] of [
      ["l-1", video({ lastModified: 1 })],
      ["l-2", video()],
    ] as const) {
      const other = setup({ lessonId, file, resumeOnly: true });
      other.options.tus = {
        Upload: FakeUpload,
        defaultOptions: { urlStorage: store },
      };
      FakeUpload.made = [];
      expect(await new BunnyUpload(other.options).run()).toEqual({
        status: "failed",
        code: "UPLOAD_NOT_FOUND",
        videoId: null,
      });
      expect(other.resign).not.toHaveBeenCalled();
      expect(other.start).not.toHaveBeenCalled();
      expect(FakeUpload.made).toHaveLength(0);
    }
  });

  it("forgets an upload tedrisat will not sign again, and says why", async () => {
    const { store, entries } = await halfway();
    const closed = setup({
      resumeOnly: true,
      resign: async () => ({
        success: false,
        code: "RECORDING_UPLOAD_CLOSED",
        reason: "expired",
      }),
    });
    closed.options.tus = {
      Upload: FakeUpload,
      defaultOptions: { urlStorage: store },
    };
    FakeUpload.made = [];
    expect(await new BunnyUpload(closed.options).run()).toEqual({
      status: "failed",
      code: "RECORDING_UPLOAD_CLOSED",
      reason: "expired",
      videoId: null,
    });
    expect(entries.size).toBe(0);
    expect(FakeUpload.made).toHaveLength(0);
  });

  it("starts a new upload instead when adding, once the earlier one cannot be continued", async () => {
    const { store } = await halfway();
    const adding = setup({
      resign: async () => ({
        success: false,
        code: "RECORDING_UPLOAD_CLOSED",
        reason: "not-processing",
      }),
    });
    adding.options.tus = {
      Upload: FakeUpload,
      defaultOptions: { urlStorage: store },
    };
    FakeUpload.made = [];
    new BunnyUpload(adding.options).run();
    await flush();
    expect(adding.start).toHaveBeenCalledTimes(1);
    expect(tusOf().resumedFrom).toBeNull();
  });

  it("keeps any other refusal of the re-sign, and the stored upload with it", async () => {
    const { store, entries } = await halfway();
    const refused = setup({
      resign: async () => ({ success: false, code: "AUTHZ_FORBIDDEN" }),
    });
    refused.options.tus = {
      Upload: FakeUpload,
      defaultOptions: { urlStorage: store },
    };
    expect(await new BunnyUpload(refused.options).run()).toEqual({
      status: "failed",
      code: "AUTHZ_FORBIDDEN",
      videoId: null,
    });
    expect(refused.start).not.toHaveBeenCalled();
    expect(entries.size).toBe(1);
  });

  it("takes a storage the browser refuses for no earlier upload", async () => {
    const { options, start } = setup();
    options.tus = {
      Upload: FakeUpload,
      defaultOptions: {
        urlStorage: {
          ...memoryStore().store,
          findUploadsByFingerprint: async () => {
            throw new Error("SecurityError");
          },
        },
      },
    };
    new BunnyUpload(options).run();
    await flush();
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe("what stopped it", () => {
  const status = (code: number) => ({
    originalRequest: {},
    originalResponse: { getStatus: () => code },
  });

  it("is a refusal for Bunny's 401 and 403, the connection when no answer came, anything else otherwise", () => {
    expect(tusFailureCode(status(401))).toBe("UPLOAD_REFUSED");
    expect(tusFailureCode(status(403))).toBe("UPLOAD_REFUSED");
    expect(
      tusFailureCode({ originalRequest: {}, originalResponse: null })
    ).toBe("UPLOAD_NETWORK");
    expect(tusFailureCode(status(500))).toBe("UPLOAD_FAILED");
    expect(tusFailureCode(new Error("tus: no file"))).toBe("UPLOAD_FAILED");
    expect(tusFailureCode(null)).toBe("UPLOAD_FAILED");
  });

  it("ends a run tus gave up on with that code and the video, and Devam et signs it again", async () => {
    const { options, resign } = setup();
    const upload = new BunnyUpload(options);
    const run = upload.run();
    await flush();
    tusOf().options.onError(
      Object.assign(new Error("tus: failed"), {
        originalRequest: {},
        originalResponse: null,
      })
    );
    expect(await run).toEqual({
      status: "failed",
      code: "UPLOAD_NETWORK",
      videoId: "v-1",
    });
    upload.run();
    await flush();
    expect(resign).toHaveBeenCalledWith("v-1");
    expect(tusOf().starts).toBe(2);
  });
});
