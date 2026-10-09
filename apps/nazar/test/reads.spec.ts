import { ResponseError } from "@medaris/services/tedrisat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assignment, course, medrese } from "./fixtures";

/**
 * The portal's reads: the roles behind the gate and the numbers behind the
 * badges. The API client is a stub; the sign-in session is a stub.
 */
const REDIRECT = "NEXT_REDIRECT";
let session: { user: Record<string, unknown> } | null;
const api = {
  me: { getMyAssignments: vi.fn() },
  notifications: { getNotificationCounts: vi.fn() },
  madrasahs: { getMadrasahBadgeCounts: vi.fn() },
  courses: { getCourseBadgeCounts: vi.fn() },
};
let clientFails = false;
/** `tedrisatApi` with no token: the session is over and it sends the caller to sign-in. */
let sessionOver = false;

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`${REDIRECT}:${to}`);
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith(REDIRECT)) {
      throw error;
    }
  },
}));
vi.mock("~/lib/auth_options", () => ({ auth: async () => session }));
vi.mock("~/lib/tedrisat-api", () => ({
  tedrisatApi: async () => {
    if (sessionOver) throw new Error(`${REDIRECT}:/auth/signin`);
    if (clientFails) throw new Error("the client could not be made");
    return api;
  },
}));

const status = (code: number) =>
  new ResponseError(new Response(null, { status: code }), `HTTP ${code}`);

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  session = {
    user: { name: "Mehmet Emin Işıkoğlu", email: "mehmet@example.com" },
  };
  clientFails = false;
  sessionOver = false;
  for (const group of Object.values(api)) {
    for (const fn of Object.values(group)) fn.mockReset();
  }
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errors.mockRestore());

describe("getPortal", () => {
  const portal = async () =>
    (await import("~/features/shell/reads")).getPortal();

  it("reads the person, their assignments, their scopes and their roles", async () => {
    api.me.getMyAssignments.mockResolvedValue({
      assignments: [
        medrese(),
        assignment({ id: "c", scopeId: "c-1", isImam: true, course: course() }),
      ],
    });
    const result = await portal();
    expect(result).toMatchObject({
      status: "ok",
      person: { name: "Mehmet Emin Işıkoğlu", email: "mehmet@example.com" },
      roles: ["MEDRESE_BASMUDERRIS", "MUDERRIS"],
    });
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.scopes.map((s) => `${s.kind}:${s.id}`)).toEqual([
      "medrese:m-1",
      "ders:c-1",
    ]);
    expect(result.assignments).toHaveLength(2);
  });

  it("reads an empty list as a person with nothing, not as a failure", async () => {
    api.me.getMyAssignments.mockResolvedValue({ assignments: [] });
    expect(await portal()).toMatchObject({
      status: "ok",
      scopes: [],
      roles: [],
    });
  });

  it("is unavailable, and says so in the log, when the API answers 5xx", async () => {
    api.me.getMyAssignments.mockRejectedValue(status(503));
    expect(await portal()).toEqual({ status: "unavailable" });
    expect(errors).toHaveBeenCalled();
  });

  it("is unavailable, not empty, for any other failure too", async () => {
    for (const failure of [
      status(401),
      status(403),
      new TypeError("fetch failed"),
    ]) {
      api.me.getMyAssignments.mockRejectedValue(failure);
      expect(await portal()).toEqual({ status: "unavailable" });
    }
    clientFails = true;
    expect(await portal()).toEqual({ status: "unavailable" });
  });

  it("sends a request with no session to the sign-in page", async () => {
    session = null;
    await expect(portal()).rejects.toThrow(`${REDIRECT}:/auth/signin`);
  });

  it("sends a session that is over for the server to sign-in too, never to the retry state", async () => {
    // auth() still reads the cookie as signed in; the token is gone.
    sessionOver = true;
    await expect(portal()).rejects.toThrow(`${REDIRECT}:/auth/signin`);
    expect(api.me.getMyAssignments).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("getMenuCounts", () => {
  const counts = async (kind: "medrese" | "ders") =>
    (await import("~/features/shell/reads")).getMenuCounts({
      kind,
      id: "x-1",
      name: "x",
      role: kind === "medrese" ? "MEDRESE_BASMUDERRIS" : "MUDERRIS",
      isImam: false,
      koskName: null,
    });

  it("reads Dersler from the courses with a waiting application and Bildirimler from the unread", async () => {
    api.notifications.getNotificationCounts.mockResolvedValue({
      unread: 2,
      total: 9,
    });
    api.madrasahs.getMadrasahBadgeCounts.mockResolvedValue({
      pendingApplications: 3,
      coursesWithPendingApplications: 2,
    });
    expect(await counts("medrese")).toEqual({
      unread: 2,
      coursesWithApplications: 2,
    });
    expect(api.madrasahs.getMadrasahBadgeCounts).toHaveBeenCalledWith({
      id: "x-1",
    });
    expect(api.courses.getCourseBadgeCounts).not.toHaveBeenCalled();
  });

  it("reads Celseler and Talebeler of a course from its two numbers", async () => {
    api.notifications.getNotificationCounts.mockResolvedValue({
      unread: 3,
      total: 3,
    });
    api.courses.getCourseBadgeCounts.mockResolvedValue({
      missingMeetingLinks: 1,
      pendingApplications: 2,
    });
    expect(await counts("ders")).toEqual({
      unread: 3,
      missingLinks: 1,
      applications: 2,
    });
    expect(api.courses.getCourseBadgeCounts).toHaveBeenCalledWith({
      id: "x-1",
    });
    expect(api.madrasahs.getMadrasahBadgeCounts).not.toHaveBeenCalled();
  });

  it("drops a badge the role matrix refuses (403) without a word and keeps the others", async () => {
    api.notifications.getNotificationCounts.mockResolvedValue({
      unread: 4,
      total: 4,
    });
    api.madrasahs.getMadrasahBadgeCounts.mockRejectedValue(status(403));
    api.courses.getCourseBadgeCounts.mockRejectedValue(status(403));
    expect(await counts("medrese")).toEqual({
      unread: 4,
      coursesWithApplications: undefined,
    });
    expect(await counts("ders")).toEqual({
      unread: 4,
      missingLinks: undefined,
      applications: undefined,
    });
    expect(errors).not.toHaveBeenCalled();
  });

  it("drops a badge that failed otherwise and logs it, never throwing", async () => {
    api.notifications.getNotificationCounts.mockRejectedValue(status(500));
    api.madrasahs.getMadrasahBadgeCounts.mockRejectedValue(new Error("boom"));
    api.courses.getCourseBadgeCounts.mockRejectedValue(status(404));
    expect(await counts("medrese")).toEqual({
      unread: undefined,
      coursesWithApplications: undefined,
    });
    await expect(counts("ders")).resolves.toEqual({
      unread: undefined,
      missingLinks: undefined,
      applications: undefined,
    });
    expect(errors).toHaveBeenCalled();
  });

  it("is empty, and does not throw, when there is no client", async () => {
    clientFails = true;
    expect(await counts("medrese")).toEqual({});
    expect(await counts("ders")).toEqual({});
  });

  it("passes the way to sign-in on when the session is over", async () => {
    sessionOver = true;
    await expect(counts("medrese")).rejects.toThrow(`${REDIRECT}:/auth/signin`);
  });
});
