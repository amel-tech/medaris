import { BunnyStreamClient } from "../../../src/bunny-stream/bunny-stream.client";
import type { IBunnyStreamConfig } from "../../../src/config/bunny-stream-env";
import type {
  IBunnyUploadRow,
  IVideoRemoval,
  RecordingRepository,
} from "../../../src/course/recording.repository";
import { RecordingEncodingPoller } from "../../../src/course/recording-encoding.poller";
import type { RecordingReleasePoller } from "../../../src/course/recording-release.poller";

/**
 * The encoding poll's second step (13 October): the replaced Bunny videos
 * that are due are deleted from the library. Which ones are due, and that a
 * video a recording holds again is dropped without a call, is SQL in
 * `RecordingRepository.claimVideoRemovals`, run against Postgres in
 * test/e2e/recording-upload.e2e.spec.ts. This covers what the poll does with
 * what the claim hands it: the Bunny call, a 404 taken as done, a refusal
 * counted and left for a later pass, and the counts.
 */

const LIBRARY: IBunnyStreamConfig = {
  libraryId: "424242",
  apiKey: "unit-library-api-key",
  tokenKey: null,
  embedLifetimeSeconds: 21_600,
  collectionId: null,
};
const VIDEOS = `https://video.bunnycdn.com/library/${LIBRARY.libraryId}/videos`;
const NOW = new Date("2026-10-13T12:00:00.000Z");
const ACTOR = "a1300000-0000-4000-8000-000000000001";

const removal = (videoId: string, over: Partial<IVideoRemoval> = {}) => ({
  videoId,
  recordingId: "a1300000-0000-4000-8000-0000000000aa",
  replacedByVideoId: null,
  queuedBy: ACTOR,
  queuedAt: new Date("2026-10-13T11:00:00.000Z"),
  attempts: 0,
  ...over,
});

/** Bunny's Stream API in memory: the library's videos, and what was asked of it. */
class FakeBunny {
  readonly videos = new Set<string>();
  /** videos whose DELETE Bunny answers with 500 */
  readonly refused = new Set<string>();
  readonly calls: Array<{ method: string; url: string; accessKey: string }> =
    [];

  readonly fetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const headers = (init?.headers ?? {}) as Record<string, string>;
    this.calls.push({ method, url, accessKey: headers.AccessKey });
    const id = url.slice(VIDEOS.length + 1);
    if (method === "DELETE") {
      if (this.refused.has(id)) return new Response("{}", { status: 500 });
      if (!this.videos.delete(id)) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response("{}", { status: 400 });
  };
}

function build(
  config: IBunnyStreamConfig | null = LIBRARY,
  uploads: IBunnyUploadRow[] = []
) {
  const bunny = new FakeBunny();
  const order: string[] = [];
  const queue = new Map<string, IVideoRemoval>();
  const finished: Array<{ videoId: string; alreadyGone: boolean }> = [];
  const repo = {
    findProcessingBunnyUploads: vi.fn(async () => {
      order.push("settle");
      return uploads;
    }),
    touchBunnyUpload: vi.fn(async () => undefined),
    settleBunnyUpload: vi.fn(async () => true),
    claimVideoRemovals: vi.fn(async (limit: number) => {
      order.push("claim");
      return { due: [...queue.values()].slice(0, limit), kept: 0 };
    }),
    finishVideoRemoval: vi.fn(
      async (row: IVideoRemoval, alreadyGone: boolean) => {
        if (!queue.delete(row.videoId)) return false;
        finished.push({ videoId: row.videoId, alreadyGone });
        return true;
      }
    ),
    failVideoRemoval: vi.fn(async (videoId: string) => {
      const row = queue.get(videoId);
      if (!row) return 0;
      row.attempts += 1;
      return row.attempts;
    }),
  };
  const poller = new RecordingEncodingPoller(
    new BunnyStreamClient(config, bunny.fetch as never),
    repo as unknown as RecordingRepository,
    { announce: vi.fn() } as unknown as RecordingReleasePoller
  );
  return { poller, bunny, repo, queue, finished, order };
}

describe("RecordingEncodingPoller: deleting replaced videos (13 October)", () => {
  it("deletes each due video from Bunny with the API key, and counts it", async () => {
    const { poller, bunny, queue, finished } = build();
    bunny.videos.add("v-old");
    queue.set("v-old", removal("v-old", { replacedByVideoId: "v-new" }));

    const result = await poller.pollOnce(NOW);
    expect(result).toEqual({
      ready: 0,
      failed: 0,
      waiting: 0,
      errors: 0,
      removed: 1,
      removeErrors: 0,
    });
    expect(bunny.calls).toEqual([
      {
        method: "DELETE",
        url: `${VIDEOS}/v-old`,
        accessKey: LIBRARY.apiKey,
      },
    ]);
    expect(bunny.videos.has("v-old")).toBe(false);
    expect(finished).toEqual([{ videoId: "v-old", alreadyGone: false }]);
    expect(queue.size).toBe(0);
  });

  it("takes a 404 for a video already gone: done, and said so", async () => {
    const { poller, queue, finished } = build();
    queue.set("v-gone", removal("v-gone"));
    expect(await poller.pollOnce(NOW)).toMatchObject({
      removed: 1,
      removeErrors: 0,
    });
    expect(finished).toEqual([{ videoId: "v-gone", alreadyGone: true }]);
  });

  it("counts a refusal, marks the try and leaves the video for a later pass, which deletes it", async () => {
    const { poller, bunny, repo, queue, finished } = build();
    bunny.videos.add("v-old");
    bunny.refused.add("v-old");
    queue.set("v-old", removal("v-old"));

    expect(await poller.pollOnce(NOW)).toMatchObject({
      removed: 0,
      removeErrors: 1,
    });
    expect(repo.failVideoRemoval).toHaveBeenCalledExactlyOnceWith("v-old", NOW);
    expect(repo.finishVideoRemoval).not.toHaveBeenCalled();
    expect(queue.get("v-old")?.attempts).toBe(1);
    expect(bunny.videos.has("v-old")).toBe(true);

    bunny.refused.clear();
    expect(await poller.pollOnce(NOW)).toMatchObject({
      removed: 1,
      removeErrors: 0,
    });
    expect(finished).toEqual([{ videoId: "v-old", alreadyGone: false }]);
  });

  it("goes on to the next video when one is refused", async () => {
    const { poller, bunny, queue } = build();
    for (const id of ["v-1", "v-2", "v-3"]) {
      bunny.videos.add(id);
      queue.set(id, removal(id));
    }
    bunny.refused.add("v-2");
    expect(await poller.pollOnce(NOW)).toMatchObject({
      removed: 2,
      removeErrors: 1,
    });
    expect([...queue.keys()]).toEqual(["v-2"]);
  });

  it("does not count a video another poll took off the queue first", async () => {
    const { poller, bunny, repo, queue } = build();
    bunny.videos.add("v-old");
    queue.set("v-old", removal("v-old"));
    repo.finishVideoRemoval.mockResolvedValueOnce(false);
    expect(await poller.pollOnce(NOW)).toMatchObject({
      removed: 0,
      removeErrors: 0,
    });
  });

  it("settles the uploads first, so an upload over in this pass has its replaced video deleted in it", async () => {
    const { poller, order } = build(LIBRARY, []);
    await poller.pollOnce(NOW);
    expect(order).toEqual(["settle", "claim"]);
  });

  it("asks nothing when no library is configured", async () => {
    const { poller, bunny, repo, queue } = build(null);
    queue.set("v-old", removal("v-old"));
    expect(await poller.pollOnce(NOW)).toMatchObject({
      removed: 0,
      removeErrors: 0,
    });
    expect(repo.claimVideoRemovals).not.toHaveBeenCalled();
    expect(bunny.calls).toEqual([]);
  });
});
