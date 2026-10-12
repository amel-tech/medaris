import type { RecordingResponse } from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import {
  accessOf,
  anyBunnyPending,
  bunnyPending,
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
  type ReleaseForm,
  recordingErrorKey,
  recordingsHref,
  recordingsMoved,
  recordingWeeks,
  refusalReasonOf,
  releaseChange,
  releaseErrorKey,
  releaseFormOf,
  releaseProblem,
  releasesOf,
  type SessionSlot,
  slotCounts,
  slotState,
  streamRecordingBody,
  streamToRecord,
  switchLocked,
  uploadBody,
  uploadContinues,
  uploadErrorKey,
  uploadMoved,
  uploadReplaces,
  type WeekBlock,
} from "~/features/recordings/recordings";
import { clockLocative, dayMonthClock } from "~/lib/dates";

/**
 * Ders kayıtları's rules: the weeks and the session each recording belongs to,
 * what a session offers against the clock, what the form checks and sends, and
 * the sentence a refusal gets.
 */
const lesson = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `Celse ${id}`,
  type: "LIVE",
  scheduledAt: new Date("2026-10-05T18:00:00Z"),
  cancelledAt: null,
  ...over,
});

const recording = (
  lessonId: string,
  over: Partial<RecordingResponse> = {}
): RecordingResponse => ({
  id: `r-${lessonId}`,
  lessonId,
  weekId: "w",
  weekNumber: 1,
  weekTitle: "Hafta",
  title: `Kayıt ${lessonId}`,
  provider: "OTHER",
  url: "https://us02web.zoom.us/rec/share/abc",
  visibility: "ENROLLED",
  status: "READY",
  ...over,
});

const course = (weeks: unknown[]) => ({ weeks }) as never;

const VIDEO = "b2470000-0000-4000-8000-000000000001";

describe("the address", () => {
  it("is the course's kayitlar, encoded", () => {
    expect(recordingsHref("c 1")).toBe("/ders/c%201/kayitlar");
  });
});

describe("the weeks of the list", () => {
  const weeks = [
    {
      id: "w1",
      weekNumber: 1,
      title: "Birinci",
      lessons: [lesson("a", { scheduledAt: new Date("2026-09-28T18:00:00Z") })],
    },
    {
      id: "w2",
      weekNumber: 2,
      title: "İkinci",
      lessons: [
        lesson("c", { scheduledAt: new Date("2026-10-06T18:00:00Z") }),
        lesson("b", { scheduledAt: new Date("2026-10-05T18:00:00Z") }),
        lesson("v", { type: "VIDEO" }),
        lesson("x", { cancelledAt: new Date("2026-10-01T00:00:00Z") }),
      ],
    },
    { id: "w3", weekNumber: 3, title: "Üçüncü", lessons: [] },
  ];

  it("come newest first, each with its live sessions by time", () => {
    const blocks = recordingWeeks(course(weeks), []);
    expect(blocks.map((b) => b.weekNumber)).toEqual([2, 1]);
    expect(blocks[0]?.slots.map((s) => s.lessonId)).toEqual(["b", "c"]);
  });

  it("leave out a week with nothing to list", () => {
    expect(
      recordingWeeks(course(weeks), []).some((b) => b.weekNumber === 3)
    ).toBe(false);
  });

  it("hand each session the recording it holds", () => {
    const blocks = recordingWeeks(course(weeks), [
      recording("b", { provider: "DRIVE", status: "PROCESSING", url: null }),
    ]);
    const slot = blocks[0]?.slots.find((s) => s.lessonId === "b");
    expect(slot?.recording).toEqual({
      id: "r-b",
      title: "Kayıt b",
      provider: "DRIVE",
      url: null,
      status: "PROCESSING",
      visibility: "ENROLLED",
    });
    expect(blocks[0]?.slots.find((s) => s.lessonId === "c")?.recording).toBe(
      null
    );
  });

  it("list a lesson of another kind, or a cancelled session, only while it holds a recording", () => {
    const blocks = recordingWeeks(course(weeks), [
      recording("v"),
      recording("x"),
    ]);
    expect(blocks[0]?.slots.map((s) => s.lessonId).sort()).toEqual([
      "b",
      "c",
      "v",
      "x",
    ]);
  });

  it("put a session with no time last", () => {
    const blocks = recordingWeeks(
      course([
        {
          id: "w",
          weekNumber: 1,
          title: "",
          lessons: [
            lesson("n", { scheduledAt: null }),
            lesson("t", { scheduledAt: new Date("2026-10-05T18:00:00Z") }),
          ],
        },
      ]),
      []
    );
    expect(blocks[0]?.slots.map((s) => s.lessonId)).toEqual(["t", "n"]);
    expect(blocks[0]?.slots[1]?.startsAt).toBeNull();
  });
});

describe("what a session offers", () => {
  const NOW = new Date("2026-10-05T19:00:00Z");
  const slot = (over: Partial<SessionSlot> = {}): SessionSlot => ({
    lessonId: "a",
    title: "Celse",
    startsAt: "2026-10-05T18:00:00.000Z",
    endsAt: "2026-10-05T19:00:00.000Z",
    streamUrl: null,
    recording: null,
    availableAt: null,
    ...over,
  });
  const held: RecordingFact = {
    id: "r",
    title: "Kayıt",
    provider: "OTHER",
    url: null,
    status: "PROCESSING",
    visibility: "ENROLLED",
  };

  it("is its recording when it has one, whatever else is true", () => {
    expect(slotState(slot({ recording: held }), NOW)).toBe("recorded");
  });

  it("is 'Kayıt ekle' once the session has begun, and nothing before", () => {
    expect(slotState(slot(), NOW)).toBe("missing");
    expect(slotState(slot({ startsAt: "2026-10-05T19:00:00.000Z" }), NOW)).toBe(
      "missing"
    );
    expect(slotState(slot({ startsAt: "2026-10-12T18:00:00.000Z" }), NOW)).toBe(
      "notYet"
    );
  });

  it("is 'Kayıt ekle' for a session with no time set", () => {
    expect(slotState(slot({ startsAt: null }), NOW)).toBe("missing");
  });

  it("counts the sessions that hold a recording and those that have begun and do not", () => {
    const counts = slotCounts(
      [
        {
          weekId: "w",
          weekNumber: 1,
          title: "",
          slots: [
            slot({ lessonId: "1", recording: held }),
            slot({ lessonId: "2" }),
            slot({ lessonId: "3", startsAt: "2026-10-12T18:00:00.000Z" }),
          ],
        },
      ],
      NOW
    );
    expect(counts).toEqual({ recorded: 1, missing: 1 });
  });
});

describe("Yayını kayıt olarak ekle (MDRS-283)", () => {
  const STREAM = "https://www.youtube.com/live/abcdefghijk";
  const slot = (over: Partial<SessionSlot> = {}): SessionSlot => ({
    lessonId: "a",
    title: "Hafta 2",
    startsAt: "2026-10-05T18:00:00.000Z",
    endsAt: "2026-10-05T19:00:00.000Z",
    streamUrl: STREAM,
    recording: null,
    availableAt: null,
    ...over,
  });
  const OVER = new Date("2026-10-05T19:00:00Z");

  it("is offered on a session that is over, had a stream and holds no recording", () => {
    expect(streamToRecord(slot(), OVER)).toBe(STREAM);
  });

  it("is not offered while the session runs, nor without a stream, a time or with a recording", () => {
    expect(streamToRecord(slot(), new Date("2026-10-05T18:59:00Z"))).toBeNull();
    expect(streamToRecord(slot({ streamUrl: null }), OVER)).toBeNull();
    expect(streamToRecord(slot({ endsAt: null }), OVER)).toBeNull();
    expect(
      streamToRecord(
        slot({
          recording: {
            id: "r",
            title: "Kayıt",
            provider: "YOUTUBE",
            url: STREAM,
            status: "READY",
            visibility: "ENROLLED",
          },
        }),
        OVER
      )
    ).toBeNull();
  });

  it("sends the stream link as it is, with the title the form would start from, for the enrolled", () => {
    expect(streamRecordingBody(slot(), STREAM, "kaydı")).toEqual({
      title: "Hafta 2 kaydı",
      url: STREAM,
      visibility: "ENROLLED",
    });
  });

  it("reads the end and the stream of each session into the list", () => {
    const blocks = recordingWeeks(
      course([
        {
          id: "w",
          weekNumber: 1,
          title: "",
          lessons: [
            lesson("s", {
              scheduledAt: new Date("2026-10-05T18:00:00Z"),
              durationMinutes: 90,
            }),
            lesson("t", {
              scheduledAt: new Date("2026-10-06T18:00:00Z"),
              durationMinutes: null,
            }),
          ],
        },
      ]),
      [],
      { s: STREAM }
    );
    expect(blocks[0]?.slots.map((s) => [s.endsAt, s.streamUrl])).toEqual([
      ["2026-10-05T19:30:00.000Z", STREAM],
      ["2026-10-06T19:00:00.000Z", null],
    ]);
  });
});

describe("providers", () => {
  it("name YouTube and Google Drive and keep the host of everything else, Bunny too", () => {
    expect(chipOf("YOUTUBE")).toBe("youtube");
    expect(chipOf("DRIVE")).toBe("google-drive");
    expect(chipOf("OTHER")).toBeNull();
    // the design kit has no Bunny chip: Medaris's own host plays in the page
    expect(chipOf("BUNNY")).toBeNull();
    expect(hostOf("https://us02web.zoom.us/rec/share/abc")).toBe(
      "us02web.zoom.us"
    );
    expect(hostOf("not a link")).toBe("not a link");
  });

  it.each([
    ["https://www.youtube.com/watch?v=abc", "YOUTUBE"],
    ["youtu.be/abc", "YOUTUBE"],
    ["https://www.youtube-nocookie.com/embed/abc", "YOUTUBE"],
    ["https://drive.google.com/file/d/xyz/view", "DRIVE"],
    ["https://docs.google.com/document/d/xyz", "DRIVE"],
    ["https://us02web.zoom.us/rec/share/abc", "OTHER"],
    ["https://youtube.com.example.org/x", "OTHER"],
    ["http://www.youtube.com/watch?v=abc", "OTHER"],
    [`https://player.mediadelivery.net/embed/424242/${VIDEO}`, "BUNNY"],
    [`https://iframe.mediadelivery.net/embed/424242/${VIDEO}`, "BUNNY"],
    [`player.mediadelivery.net/play/424242/${VIDEO}`, "BUNNY"],
    [`https://PLAYER.mediadelivery.net/embed/424242/${VIDEO}`, "BUNNY"],
    [`https://video.bunnycdn.com/play/424242/${VIDEO}`, "BUNNY"],
    // tedrisat refuses a Bunny host that is not a player; it is still Bunny's
    [`https://vz-abc.b-cdn.net/${VIDEO}/playlist.m3u8`, "BUNNY"],
    [`https://player.mediadelivery.net.example.org/embed/1/${VIDEO}`, "OTHER"],
    ["https://notmediadelivery.net/embed/1/x", "OTHER"],
    ["", "OTHER"],
  ])("read %s as %s, as tedrisat does", (link, provider) => {
    expect(providerOfLink(link)).toBe(provider);
  });
});

describe("the form", () => {
  const filled = {
    title: "Celse 1 kaydı",
    url: "https://us02web.zoom.us/rec/share/abc",
    isPublic: false,
  };

  it("starts a new recording with the session's name as title, a blank link and the switch off", () => {
    expect(newForm("Hafta 3", "kaydı")).toEqual({
      title: "Hafta 3 kaydı",
      url: "",
      isPublic: false,
    });
  });

  it("starts an existing recording from what it holds", () => {
    expect(
      formOf({
        id: "r",
        title: "Kayıt",
        provider: "DRIVE",
        url: "https://drive.google.com/file/d/xyz/view",
        status: "READY",
        visibility: "PUBLIC",
      })
    ).toEqual({
      title: "Kayıt",
      url: "https://drive.google.com/file/d/xyz/view",
      isPublic: true,
    });
    expect(
      formOf({
        id: "r",
        title: "Kayıt",
        provider: "OTHER",
        url: null,
        status: "PROCESSING",
        visibility: "ENROLLED",
      }).url
    ).toBe("");
  });

  it("lets a complete form through", () => {
    expect(formErrors(filled)).toEqual({});
  });

  it("names a missing title, a missing link, and a link that is not https", () => {
    expect(formErrors({ ...filled, title: "  " })).toEqual({ title: true });
    expect(formErrors({ ...filled, url: "" })).toEqual({ linkEmpty: true });
    expect(formErrors({ ...filled, url: "http://zoom.us/rec/1" })).toEqual({
      link: true,
    });
    expect(formErrors({ ...filled, url: "ftp://zoom.us/rec/1" })).toEqual({
      link: true,
    });
  });

  it("takes a link with no scheme, as everywhere else", () => {
    expect(formErrors({ ...filled, url: "zoom.us/rec/1" })).toEqual({});
  });

  it("takes a YouTube link with the switch off or on (the owner's 3 October decision)", () => {
    const youtube = { ...filled, url: "https://youtu.be/abc" };
    expect(formErrors(youtube)).toEqual({});
    expect(formErrors({ ...youtube, isPublic: true })).toEqual({});
  });

  it("locks the switch off for a closed course only", () => {
    expect(switchLocked({ isPublic: false }, true)).toEqual({
      locked: true,
      reason: "closed",
    });
    expect(switchLocked({ isPublic: false }, false)).toEqual({
      locked: false,
      reason: null,
    });
    // a public recording, on YouTube or anywhere, can be closed again
    expect(switchLocked({ isPublic: true }, false)).toEqual({
      locked: false,
      reason: null,
    });
    // a recording that is already public can still be closed in a closed course
    expect(switchLocked({ isPublic: true }, true)).toEqual({
      locked: false,
      reason: null,
    });
  });
});

describe("what a write sends", () => {
  const filled = {
    title: "  Kayıt  ",
    url: "  zoom.us/rec/1 ",
    isPublic: true,
  };
  const held: RecordingFact = {
    id: "r",
    title: "Kayıt",
    provider: "OTHER",
    url: "https://zoom.us/rec/1",
    status: "READY",
    visibility: "ENROLLED",
  };

  it("adds with a trimmed title, the link on https and the visibility the switch says", () => {
    expect(createBody(filled)).toEqual({
      title: "Kayıt",
      url: "https://zoom.us/rec/1",
      visibility: "PUBLIC",
    });
    expect(createBody({ ...filled, isPublic: false })?.visibility).toBe(
      "ENROLLED"
    );
  });

  it("sends nothing while the form has a problem", () => {
    expect(createBody({ ...filled, title: "" })).toBeNull();
    expect(createBody({ ...filled, url: "http://zoom.us/1" })).toBeNull();
  });

  it("adds a YouTube link closed to everyone but the course", () => {
    expect(
      createBody({ ...filled, url: "https://youtu.be/abc", isPublic: false })
    ).toEqual({
      title: "Kayıt",
      url: "https://youtu.be/abc",
      visibility: "ENROLLED",
    });
  });

  it("edits only what changed", () => {
    expect(
      patchBody(
        { title: "Yeni", url: "https://zoom.us/rec/1", isPublic: false },
        held
      )
    ).toEqual({ title: "Yeni" });
    expect(
      patchBody(
        { title: "Kayıt", url: "https://zoom.us/rec/2", isPublic: false },
        held
      )
    ).toEqual({ url: "https://zoom.us/rec/2" });
    expect(
      patchBody(
        { title: "Kayıt", url: "https://zoom.us/rec/1", isPublic: true },
        held
      )
    ).toEqual({ visibility: "PUBLIC" });
  });

  it("does not take a link typed without its scheme for a change", () => {
    expect(
      patchBody({ title: "Kayıt", url: "zoom.us/rec/1", isPublic: false }, held)
    ).toBeNull();
  });

  it("sends nothing when nothing changed or the form has a problem", () => {
    expect(
      patchBody(
        { title: "Kayıt", url: "https://zoom.us/rec/1", isPublic: false },
        held
      )
    ).toBeNull();
    expect(
      patchBody(
        { title: "", url: "https://zoom.us/rec/1", isPublic: false },
        held
      )
    ).toBeNull();
  });
});

describe("what the API refuses", () => {
  it.each([
    ["AUTHZ_FORBIDDEN", "Problems.actionForbidden"],
    ["RECORDING_EXISTS", "Recordings.errors.exists"],
    ["LESSON_CANCELLED", "Recordings.errors.cancelled"],
    ["LESSON_NOT_FOUND", "Recordings.errors.gone"],
    ["RECORDING_NOT_FOUND", "Recordings.errors.gone"],
    ["VALIDATION_ERROR", "Recordings.errors.invalid"],
    ["RECORDING_YOUTUBE_PUBLIC_ONLY", "Problems.actionGeneric"],
    ["SOMETHING_NEW", "Problems.actionGeneric"],
    ["", "Problems.actionGeneric"],
  ])("words %s with %s", (code, key) => {
    expect(recordingErrorKey(code)).toBe(key);
  });

  it.each([
    ["invalid", "invalid"],
    ["not-https", "notHttps"],
    ["youtube-no-video", "youtubeNoVideo"],
    ["bunny-no-video", "bunnyNoVideo"],
    ["bunny-foreign-library", "bunnyForeignLibrary"],
    ["bunny-video-used", "bunnyVideoUsed"],
    // a reason this page does not know yet, or none, is a link it cannot read
    ["something-new", "invalid"],
    ["toString", "invalid"],
    [null, "invalid"],
  ])("words a link tedrisat cannot store for %s with linkInvalid.%s", (reason, key) => {
    expect(recordingErrorKey("RECORDING_LINK_INVALID", reason)).toBe(
      `Recordings.errors.linkInvalid.${key}`
    );
  });

  it("reads the reason a refusal carries, and nothing that is not one", () => {
    expect(
      refusalReasonOf({
        code: "RECORDING_LINK_INVALID",
        context: { reason: "bunny-video-used" },
      })
    ).toBe("bunny-video-used");
    for (const body of [
      undefined,
      null,
      "RECORDING_LINK_INVALID",
      { code: "RECORDING_EXISTS", context: { lessonId: "l" } },
      { code: "RECORDING_LINK_INVALID", context: { reason: 7 } },
      { code: "RECORDING_LINK_INVALID", context: null },
    ]) {
      expect(refusalReasonOf(body)).toBeNull();
    }
  });

  it("reads the page again when the answer means it was out of date", () => {
    for (const code of [
      "RECORDING_EXISTS",
      "LESSON_CANCELLED",
      "LESSON_NOT_FOUND",
      "RECORDING_NOT_FOUND",
    ]) {
      expect(recordingsMoved(code), code).toBe(true);
    }
    for (const code of ["AUTHZ_FORBIDDEN", "VALIDATION_ERROR", ""]) {
      expect(recordingsMoved(code), code).toBe(false);
    }
  });
});

describe("the upload", () => {
  const slot = (
    over: Partial<SessionSlot["recording"]> | null
  ): SessionSlot => ({
    lessonId: "l-1",
    title: "Hafta 1",
    startsAt: "2026-10-05T18:00:00.000Z",
    endsAt: "2026-10-05T19:00:00.000Z",
    streamUrl: null,
    recording:
      over === null
        ? null
        : {
            id: "r-1",
            title: "Kayıt",
            provider: "BUNNY",
            url: null,
            status: "PROCESSING",
            visibility: "ENROLLED",
            ...over,
          },
    availableAt: null,
  });

  it("waits only on a Bunny upload that is not READY, as only those move on their own", () => {
    expect(bunnyPending(slot({}))).toBe(true);
    expect(bunnyPending(slot({ status: "READY", url: "https://x" }))).toBe(
      false
    );
    // a pasted link that is PROCESSING waits for someone to edit it
    expect(bunnyPending(slot({ provider: "OTHER" }))).toBe(false);
    expect(bunnyPending(slot(null))).toBe(false);
    const week = (slots: SessionSlot[]): WeekBlock => ({
      weekId: "w",
      weekNumber: 1,
      title: "",
      slots,
    });
    expect(anyBunnyPending([week([slot(null)]), week([slot({})])])).toBe(true);
    expect(
      anyBunnyPending([week([slot(null), slot({ provider: "YOUTUBE" })])])
    ).toBe(false);
    expect(anyBunnyPending([])).toBe(false);
  });

  it("lets an upload replace a link of any provider, never a Bunny video", () => {
    const of = (over: Partial<RecordingFact> | null) => slot(over).recording;
    for (const provider of ["YOUTUBE", "DRIVE", "OTHER"] as const) {
      expect(uploadReplaces(of({ provider, status: "READY" })), provider).toBe(
        true
      );
    }
    expect(uploadReplaces(of({}))).toBe(false);
    expect(uploadReplaces(of({ status: "READY", url: "https://x" }))).toBe(
      false
    );
    expect(uploadReplaces(of(null))).toBe(false);
  });

  it("sends the title, who may watch and the session's time, and nothing without a title", () => {
    expect(
      uploadBody(
        { title: "  Hafta 1 kaydı ", url: "", isPublic: false },
        slot(null)
      )
    ).toEqual({
      title: "Hafta 1 kaydı",
      visibility: "ENROLLED",
      recordedAt: "2026-10-05T18:00:00.000Z",
    });
    expect(
      uploadBody(
        { title: "Kayıt", url: "ignored", isPublic: true },
        { startsAt: null }
      )
    ).toEqual({ title: "Kayıt", visibility: "PUBLIC" });
    expect(
      uploadBody({ title: " ", url: "", isPublic: false }, slot(null))
    ).toBeNull();
  });

  it("writes a size in the page's language, in the largest unit under it", () => {
    expect(formatBytes(512, "tr")).toBe("512 bayt");
    expect(formatBytes(1_234_567, "tr")).toBe("1,2 MB");
    expect(formatBytes(10_000_000_000, "tr")).toBe("10 GB");
    expect(formatBytes(1_500_000_000, "en")).toBe("1.5 GB");
    expect(formatBytes(1_500_000_000, "not a locale")).toBe("1,5 GB");
  });

  it.each([
    ["AUTHZ_FORBIDDEN", null, "Problems.actionForbidden"],
    ["RECORDING_EXISTS", null, "Recordings.errors.exists"],
    ["LESSON_NOT_FOUND", null, "Recordings.errors.gone"],
    [
      "BUNNY_STREAM_NOT_CONFIGURED",
      null,
      "Recordings.upload.errors.notConfigured",
    ],
    ["BUNNY_STREAM_UNAVAILABLE", null, "Recordings.upload.errors.unavailable"],
    ["RECORDING_UPLOAD_CLOSED", "expired", "Recordings.upload.errors.expired"],
    [
      "RECORDING_UPLOAD_CLOSED",
      "not-processing",
      "Recordings.upload.errors.closed",
    ],
    ["RECORDING_UPLOAD_NOT_FOUND", null, "Recordings.upload.errors.closed"],
    ["VALIDATION_ERROR", null, "Recordings.upload.errors.invalid"],
    ["UPLOAD_NOT_FOUND", null, "Recordings.upload.errors.notFound"],
    ["UPLOAD_NETWORK", null, "Recordings.upload.errors.network"],
    ["UPLOAD_REFUSED", null, "Recordings.upload.errors.refused"],
    ["UPLOAD_FAILED", null, "Recordings.upload.errors.failed"],
    ["SOMETHING_NEW", null, "Problems.actionGeneric"],
    ["", null, "Problems.actionGeneric"],
  ])("words a stopped upload's %s (%s) with %s", (code, reason, key) => {
    expect(uploadErrorKey(code, reason)).toBe(key);
  });

  it("reads the page again behind the dialog when the session's recording changed under it", () => {
    for (const code of [
      "RECORDING_EXISTS",
      "LESSON_NOT_FOUND",
      "RECORDING_UPLOAD_CLOSED",
      "RECORDING_UPLOAD_NOT_FOUND",
    ]) {
      expect(uploadMoved(code), code).toBe(true);
    }
    for (const code of [
      "AUTHZ_FORBIDDEN",
      "BUNNY_STREAM_NOT_CONFIGURED",
      "UPLOAD_NETWORK",
      "",
    ]) {
      expect(uploadMoved(code), code).toBe(false);
    }
  });

  it("offers Devam et only for a video that exists and a stop between the browser and Bunny", () => {
    for (const code of ["UPLOAD_NETWORK", "UPLOAD_REFUSED", "UPLOAD_FAILED"]) {
      expect(uploadContinues(code, "v-1"), code).toBe(true);
      expect(uploadContinues(code, null), code).toBe(false);
    }
    for (const code of [
      "RECORDING_UPLOAD_CLOSED",
      "AUTHZ_FORBIDDEN",
      "BUNNY_STREAM_NOT_CONFIGURED",
      "UPLOAD_NOT_FOUND",
    ]) {
      expect(uploadContinues(code, "v-1"), code).toBe(false);
    }
  });
});

describe("when talebe may watch (MDRS-288)", () => {
  /** 12:00 in Istanbul */
  const NOW = new Date("2026-10-06T09:00:00Z");
  /** 14 Ekim 20:00 in Istanbul */
  const AHEAD = "2026-10-14T17:00:00.000Z";
  /** 5 Ekim 20:00 in Istanbul */
  const PAST = "2026-10-05T17:00:00.000Z";
  const IST = "Europe/Istanbul";
  const ready: RecordingFact = {
    id: "r",
    title: "Kayıt",
    provider: "OTHER",
    url: "https://zoom.us/rec/1",
    status: "READY",
    visibility: "ENROLLED",
  };
  const processing: RecordingFact = {
    ...ready,
    url: null,
    status: "PROCESSING",
  };
  const at = (local: string, over: Partial<ReleaseForm> = {}): ReleaseForm => ({
    mode: "at",
    local,
    bad: false,
    ...over,
  });
  const soon: ReleaseForm = { mode: "ready", local: "", bad: false };

  it("takes each session's time from the course read, else from its recording", () => {
    const blocks = recordingWeeks(
      course([
        {
          id: "w",
          weekNumber: 1,
          title: "",
          lessons: [
            lesson("a", { recordingAvailableAt: new Date(AHEAD) }),
            lesson("b", { scheduledAt: new Date("2026-10-06T18:00:00Z") }),
            lesson("c", { scheduledAt: new Date("2026-10-07T18:00:00Z") }),
          ],
        },
      ]),
      [recording("b", { availableAt: new Date(PAST) }), recording("c")]
    );
    expect(blocks[0]?.slots.map((s) => [s.lessonId, s.availableAt])).toEqual([
      ["a", AHEAD],
      ["b", PAST],
      ["c", null],
    ]);
  });

  it("reads the times the course carries, by session", () => {
    expect(
      releasesOf(
        course([
          {
            weekNumber: 1,
            lessons: [
              lesson("a", { recordingAvailableAt: new Date(AHEAD) }),
              lesson("b", { recordingAvailableAt: null }),
              lesson("c"),
            ],
          },
        ])
      )
    ).toEqual({ a: AHEAD });
  });

  it("says 'Açık' for a READY recording with no time, or a time that has come, the very minute included", () => {
    expect(accessOf({ recording: ready, availableAt: null }, NOW)).toEqual({
      kind: "open",
    });
    expect(accessOf({ recording: ready, availableAt: PAST }, NOW)).toEqual({
      kind: "open",
    });
    expect(
      accessOf({ recording: ready, availableAt: AHEAD }, new Date(AHEAD))
    ).toEqual({ kind: "open" });
  });

  it("says when it opens while the time is ahead, with a recording or before one exists", () => {
    for (const recording of [ready, processing, null]) {
      expect(accessOf({ recording, availableAt: AHEAD }, NOW)).toEqual({
        kind: "at",
        at: new Date(AHEAD),
      });
    }
  });

  it("says 'Hazır olunca açılır' while nothing holds back a recording that is not READY, or not there yet", () => {
    expect(accessOf({ recording: processing, availableAt: null }, NOW)).toEqual(
      { kind: "whenReady" }
    );
    expect(accessOf({ recording: processing, availableAt: PAST }, NOW)).toEqual(
      { kind: "whenReady" }
    );
    expect(accessOf({ recording: null, availableAt: null }, NOW)).toEqual({
      kind: "whenReady",
    });
  });

  it("starts the choice from what the session holds, on the course's clock", () => {
    expect(releaseFormOf(null, IST)).toEqual(soon);
    expect(releaseFormOf(AHEAD, IST)).toEqual(at("2026-10-14T20:00"));
    expect(releaseFormOf(AHEAD, "America/New_York")).toEqual(
      at("2026-10-14T13:00")
    );
  });

  it("asks for a date and a time it can read, and a new time after now", () => {
    expect(releaseProblem(soon, AHEAD, IST, NOW)).toBeNull();
    expect(releaseProblem(at(""), null, IST, NOW)).toBe("empty");
    expect(
      releaseProblem(at("2026-10-14T20:00", { bad: true }), null, IST, NOW)
    ).toBe("empty");
    expect(releaseProblem(at("2026-10-05T20:00"), null, IST, NOW)).toBe("past");
    // the minute of now is not after it
    expect(releaseProblem(at("2026-10-06T12:00"), null, IST, NOW)).toBe("past");
    expect(releaseProblem(at("2026-10-06T12:01"), null, IST, NOW)).toBeNull();
    // a stored time that has passed is the one the recording opened at, not a new one
    expect(releaseProblem(at("2026-10-05T20:00"), PAST, IST, NOW)).toBeNull();
  });

  it("sends an instant read on the course's clock, null for as soon as it is ready, and nothing unchanged", () => {
    expect(releaseChange(at("2026-10-14T20:00"), null, IST)).toEqual({
      availableAt: AHEAD,
    });
    expect(
      releaseChange(at("2026-10-15T20:00"), null, "America/New_York")
    ).toEqual({ availableAt: "2026-10-16T00:00:00.000Z" });
    expect(
      releaseChange({ ...soon, local: "2026-10-14T20:00" }, AHEAD, IST)
    ).toEqual({ availableAt: null });
    expect(releaseChange(at("2026-10-14T20:00"), AHEAD, IST)).toBeNull();
    expect(releaseChange(soon, null, IST)).toBeNull();
  });

  it("keeps a stored time to the second while its field is left as it was", () => {
    const odd = "2026-10-14T17:00:30.000Z";
    expect(releaseChange(at("2026-10-14T20:00"), odd, IST)).toBeNull();
    expect(releaseProblem(at("2026-10-14T20:00"), odd, IST, NOW)).toBeNull();
    expect(releaseChange(at("2026-10-14T20:30"), odd, IST)).toEqual({
      availableAt: "2026-10-14T17:30:00.000Z",
    });
  });

  it("goes with the link it is added with, and with an edit as one more change", () => {
    const filled = {
      title: "Kayıt",
      url: "https://zoom.us/rec/1",
      isPublic: false,
    };
    expect(createBody(filled, { availableAt: AHEAD })).toEqual({
      title: "Kayıt",
      url: "https://zoom.us/rec/1",
      visibility: "ENROLLED",
      availableAt: AHEAD,
    });
    expect(createBody(filled, { availableAt: null })).toHaveProperty(
      "availableAt",
      null
    );
    expect(createBody(filled)).not.toHaveProperty("availableAt");
    expect(patchBody(filled, ready, { availableAt: AHEAD })).toEqual({
      availableAt: AHEAD,
    });
    expect(patchBody(filled, ready, { availableAt: null })).toEqual({
      availableAt: null,
    });
    expect(patchBody(filled, ready)).toBeNull();
  });

  it.each([
    ["AUTHZ_FORBIDDEN", "Problems.actionForbidden"],
    ["LESSON_NOT_FOUND", "Recordings.errors.gone"],
    ["VALIDATION_ERROR", "Recordings.release.errors.invalid"],
    ["SOMETHING_NEW", "Problems.actionGeneric"],
  ])("words a refused time (%s) with %s", (code, key) => {
    expect(releaseErrorKey(code)).toBe(key);
  });

  it("writes the time as a sentence says when, in the zone it is given", () => {
    expect(dayMonthClock(new Date(AHEAD), "tr", IST)).toBe("14 Ekim 20:00’de");
    expect(dayMonthClock(new Date(AHEAD), "tr", "America/New_York")).toBe(
      "14 Ekim 13:00’te"
    );
    expect(dayMonthClock(new Date(AHEAD), "en", IST)).toBe("October 14, 20:00");
  });

  it.each([
    ["20:00", "20:00’de"],
    ["19:00", "19:00’da"],
    ["13:00", "13:00’te"],
    ["14:00", "14:00’te"],
    ["16:00", "16:00’da"],
    ["10:00", "10:00’da"],
    ["00:00", "00:00’da"],
    ["20:30", "20:30’da"],
    ["20:15", "20:15’te"],
    ["20:40", "20:40’ta"],
    ["20:50", "20:50’de"],
    ["21:09", "21:09’da"],
  ])("gives %s the Turkish locative of how it is said: %s", (clock, said) => {
    expect(clockLocative(clock, "tr")).toBe(said);
    expect(clockLocative(clock, "en")).toBe(clock);
  });
});
