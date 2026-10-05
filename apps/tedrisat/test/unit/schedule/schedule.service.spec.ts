import { SessionStatus } from "../../../src/course/domain/session-status.enum";
import type {
  IScheduledSession,
  ScheduleRepository,
} from "../../../src/schedule/schedule.repository";
import { ScheduleService } from "../../../src/schedule/schedule.service";

const NOW = new Date("2026-10-03T17:00:00.000Z");
const MEETING = "https://zoom.us/j/123";

const row = (over: Partial<IScheduledSession> = {}): IScheduledSession => ({
  id: "lesson-1",
  courseId: "course-1",
  courseTitle: "Emsile ve Bina",
  koskId: "kosk-1",
  koskName: "Nûruosmaniye Köşkü",
  weekNumber: 5,
  title: "Mehmûz fiiller",
  startsAt: new Date("2026-10-03T18:00:00.000Z"),
  durationMinutes: 60,
  cancelledAt: null,
  meetingUrl: MEETING,
  ...over,
});

const serviceWith = (
  rows: IScheduledSession[],
  passive: Map<string, { type: string; id: string }> = new Map()
) => {
  const repo = {
    findEnrolledSessions: vi.fn().mockResolvedValue(rows),
    findUpcoming: vi.fn().mockResolvedValue(rows),
    passiveScopesOf: vi.fn().mockResolvedValue(passive),
    recordPassiveOpens: vi.fn().mockResolvedValue(undefined),
  };
  return {
    repo,
    service: new ScheduleService(repo as unknown as ScheduleRepository),
  };
};

describe("ScheduleService (MDRS-163)", () => {
  it("derives the status from the clock and the cancellation", async () => {
    const { service } = serviceWith([
      row({ id: "ahead" }),
      row({ id: "live", startsAt: new Date("2026-10-03T16:30:00.000Z") }),
      row({ id: "over", startsAt: new Date("2026-10-03T10:00:00.000Z") }),
      row({ id: "off", cancelledAt: new Date("2026-10-01T10:00:00.000Z") }),
    ]);
    const list = await service.list(
      "u",
      "2026-10-03T00:00:00+03:00",
      "2026-10-10T00:00:00+03:00",
      NOW
    );
    expect(list.map((s) => [s.id, s.status])).toEqual([
      ["ahead", SessionStatus.SCHEDULED],
      ["live", SessionStatus.LIVE],
      ["over", SessionStatus.ENDED],
      ["off", SessionStatus.CANCELLED],
    ]);
  });

  it("hands the meeting link only for a session that can still be joined", async () => {
    const { service } = serviceWith([
      row({ id: "ahead" }),
      row({ id: "over", startsAt: new Date("2026-10-03T10:00:00.000Z") }),
      row({ id: "off", cancelledAt: new Date("2026-10-01T10:00:00.000Z") }),
    ]);
    const list = await service.list("u", "2026-10-03", "2026-10-10", NOW);
    expect(list.map((s) => s.meetingUrl)).toEqual([MEETING, null, null]);
  });

  it("records each passive course whose link it hands out, once, and nothing for a link it withholds (review D1)", async () => {
    const passive = new Map([["course-1", { type: "course", id: "course-1" }]]);
    const { service, repo } = serviceWith(
      [
        row({ id: "ahead" }),
        row({ id: "again", startsAt: new Date("2026-10-03T19:30:00.000Z") }),
        row({
          id: "over",
          courseId: "course-2",
          startsAt: new Date("2026-10-03T10:00:00.000Z"),
        }),
      ],
      passive
    );
    await service.list("u", "2026-10-03", "2026-10-10", NOW);
    // Only course-1's link went out; course-2's session is over.
    expect(repo.passiveScopesOf).toHaveBeenCalledWith(["course-1"]);
    expect(repo.recordPassiveOpens).toHaveBeenCalledWith(
      "u",
      [
        {
          courseId: "course-1",
          courseTitle: "Emsile ve Bina",
          passiveScope: { type: "course", id: "course-1" },
        },
      ],
      "schedule"
    );
  });

  it("refuses a malformed window before asking the repository", async () => {
    const { service, repo } = serviceWith([]);
    await expect(service.list("u", "x", "y", NOW)).rejects.toMatchObject({
      status: 400,
    });
    expect(repo.findEnrolledSessions).not.toHaveBeenCalled();
  });

  it("clamps the upcoming limit to 1..20", async () => {
    const { service, repo } = serviceWith([]);
    await service.upcoming("u", 500, NOW);
    await service.upcoming("u", 0, NOW);
    expect(repo.findUpcoming.mock.calls.map((c) => c[3])).toEqual([20, 1]);
  });
});
