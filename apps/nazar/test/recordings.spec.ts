import type { RecordingResponse } from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import {
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
  recordingErrorKey,
  recordingsHref,
  recordingsMoved,
  recordingWeeks,
  refusalReasonOf,
  type SessionSlot,
  slotCounts,
  slotState,
  switchLocked,
  uploadBody,
  uploadContinues,
  uploadErrorKey,
  uploadMoved,
  type WeekBlock,
} from "~/features/recordings/recordings";

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
    recording: null,
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
