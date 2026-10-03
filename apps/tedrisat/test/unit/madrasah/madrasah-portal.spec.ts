import type { AuthzService } from "@medaris/common";
import type { MadrasahCourseService } from "../../../src/madrasah/course/madrasah-course.service";
import type { MadrasahService } from "../../../src/madrasah/madrasah.service";
import {
  hostOf,
  type MadrasahPortalRepository,
} from "../../../src/madrasah/portal/madrasah-portal.repository";
import type { IDashboardApplication } from "../../../src/madrasah/portal/madrasah-portal.repository.interface";
import { MadrasahPortalService } from "../../../src/madrasah/portal/madrasah-portal.service";

const MADRASAH = "b2000000-0000-4000-8000-0000000000aa";
const KOSK = "b2000000-0000-4000-8000-0000000000bb";
const OTHER_KOSK = "b2000000-0000-4000-8000-0000000000bc";
const COURSE = "b2000000-0000-4000-8000-0000000000cc";
const OTHER_COURSE = "b2000000-0000-4000-8000-0000000000cd";

describe("hostOf (MDRS-187)", () => {
  it("names the host of a link, lowercased, and nothing else of it", () => {
    expect(hostOf("https://MEET.google.com/abc-defg-hij?authuser=1")).toBe(
      "meet.google.com"
    );
    expect(hostOf("  https://us02web.zoom.us/j/123456789  ")).toBe(
      "us02web.zoom.us"
    );
  });

  it("is null for no link, a blank one, and one that is not a URL", () => {
    expect(hostOf(null)).toBeNull();
    expect(hostOf("   ")).toBeNull();
    expect(hostOf("not a url")).toBeNull();
  });
});

describe("MadrasahPortalService (MDRS-187)", () => {
  const application = (
    over: Partial<IDashboardApplication>
  ): IDashboardApplication => ({
    courseId: COURSE,
    courseTitle: "Bina ve İzhar Şerhi",
    koskId: KOSK,
    userId: "u1",
    studentName: "Talebe",
    studentEmail: null,
    appliedAt: new Date("2026-10-01T10:00:00Z"),
    ...over,
  });
  const build = (
    deciding: { courseIds?: string[]; koskIds?: string[] },
    admin = false
  ) => {
    const repo = {
      countNazirs: vi.fn().mockResolvedValue(2),
      countCourses: vi.fn().mockResolvedValue(3),
      findUpcomingSessions: vi.fn().mockResolvedValue([]),
      findPendingApplications: vi
        .fn()
        .mockResolvedValue([
          application({}),
          application({ courseId: OTHER_COURSE, koskId: OTHER_KOSK }),
        ]),
      decidingScopes: vi.fn().mockResolvedValue({
        courseIds: new Set(deciding.courseIds),
        koskIds: new Set(deciding.koskIds),
      }),
      findStudents: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const service = new MadrasahPortalService(
      repo as unknown as MadrasahPortalRepository,
      {
        getBadgeCounts: vi.fn().mockResolvedValue({
          pendingApplications: 60,
          coursesWithPendingApplications: 4,
        }),
      } as unknown as MadrasahService,
      {
        hostingKosks: vi.fn().mockResolvedValue([]),
      } as unknown as MadrasahCourseService,
      { isSystemAdmin: () => admin } as unknown as AuthzService
    );
    return { service, repo };
  };
  const mayDecide = async (...args: Parameters<typeof build>) =>
    (
      await build(...args).service.dashboard({ sub: "viewer" }, MADRASAH)
    ).pendingApplications.map((a) => a.viewerMayDecide);

  it("takes the whole count of applications from the badge counts, not from the rows it lists", async () => {
    const dashboard = await build({}).service.dashboard(
      { sub: "viewer" },
      MADRASAH
    );
    expect(dashboard).toMatchObject({
      nazirCount: 2,
      courseCount: 3,
      pendingApplicationCount: 60,
      pendingCourseCount: 4,
    });
    expect(dashboard.pendingApplications).toHaveLength(2);
  });

  it("lets the course's müderris, its köşk's nazım and the başnazım decide, and no one else", async () => {
    expect(await mayDecide({})).toEqual([false, false]);
    expect(await mayDecide({ courseIds: [COURSE] })).toEqual([true, false]);
    expect(await mayDecide({ koskIds: [OTHER_KOSK] })).toEqual([false, true]);
    expect(await mayDecide({}, true)).toEqual([true, true]);
  });

  it("turns a page number into an offset", async () => {
    const { service, repo } = build({});
    await service.students(MADRASAH, { q: "ekinci" }, 3, 10);
    expect(repo.findStudents).toHaveBeenCalledWith(
      MADRASAH,
      { q: "ekinci" },
      10,
      20
    );
  });
});
