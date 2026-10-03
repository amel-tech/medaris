import type { ILessonMutation } from "../../../src/course/course.repository.interface";
import type { CourseNotificationRepository } from "../../../src/course/course-notification.repository";
import { CourseNotifier } from "../../../src/course/course-notifier";
import { LessonType } from "../../../src/course/domain/lesson-type.enum";
import type { NotificationService } from "../../../src/notification/notification.service";

const COURSE = "c1000000-0000-4000-8000-000000000001";
const SESSION = "c1000000-0000-4000-8000-000000000002";
const TALEBE = "c1000000-0000-4000-8000-000000000003";
const OTHER = "c1000000-0000-4000-8000-000000000004";
const MUDERRIS = "c1000000-0000-4000-8000-000000000005";

const HOUR = 3_600_000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR);

const session = (over: Partial<ILessonMutation> = {}): ILessonMutation => ({
  id: SESSION,
  weekId: "w",
  title: "Celse",
  type: LessonType.LIVE,
  durationMinutes: 60,
  kaynak: null,
  scheduledAt: inHours(24),
  meetingUrl: null,
  agenda: null,
  isPreview: false,
  orderIndex: 0,
  cancelledAt: null,
  cancelReason: null,
  replacementLessonId: null,
  courseVersion: 2,
  ...over,
});

function build(seats = [TALEBE, OTHER]) {
  const context = {
    courseId: COURSE,
    courseTitle: "Emsile",
    koskName: "Beyazıt Köşkü",
  };
  const repo = {
    findCourse: vi.fn().mockResolvedValue(context),
    findSessionCourse: vi.fn().mockResolvedValue(context),
    findSessionStart: vi.fn().mockResolvedValue(null),
    findSeatHolders: vi.fn().mockResolvedValue(seats),
  };
  const notify = vi.fn().mockResolvedValue(undefined);
  const notifier = new CourseNotifier(
    repo as unknown as CourseNotificationRepository,
    { notify } as unknown as NotificationService
  );
  return { notifier, repo, notify };
}

describe("CourseNotifier (MDRS-213)", () => {
  describe("enrolment", () => {
    it("tells the talebe their request was approved", async () => {
      const { notifier, notify } = build();
      await notifier.enrollmentApproved(COURSE, TALEBE, MUDERRIS);
      expect(notify).toHaveBeenCalledWith({
        userId: TALEBE,
        type: "ENROLLMENT_APPROVED",
        targetType: "COURSE",
        targetId: COURSE,
        params: { courseTitle: "Emsile", source: "Beyazıt Köşkü" },
      });
    });

    it("carries the rejection reason only when one was written", async () => {
      const { notifier, notify } = build();
      await notifier.enrollmentRejected(COURSE, TALEBE, MUDERRIS, "Dolu");
      await notifier.enrollmentRejected(COURSE, TALEBE, MUDERRIS, null);
      expect(notify.mock.calls[0][0].params).toEqual({
        courseTitle: "Emsile",
        source: "Beyazıt Köşkü",
        reason: "Dolu",
      });
      expect(notify.mock.calls[1][0].params).not.toHaveProperty("reason");
    });

    it("does not tell anyone of their own action", async () => {
      const { notifier, notify } = build();
      await notifier.enrollmentApproved(COURSE, TALEBE, TALEBE);
      expect(notify).not.toHaveBeenCalled();
    });

    it("never fails the write it reports on", async () => {
      const { notifier, notify } = build();
      notify.mockRejectedValue(new Error("db down"));
      await expect(
        notifier.removedFromCourse(COURSE, TALEBE, MUDERRIS, "Gerekçe")
      ).resolves.toBeUndefined();
    });
  });

  describe("sessions", () => {
    it("tells every active seat but the actor of a cancellation, with the session's link", async () => {
      const { notifier, notify } = build([TALEBE, MUDERRIS]);
      const cancelled = session({ cancelledAt: new Date() });
      await notifier.sessionCancelled(cancelled, MUDERRIS);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify.mock.calls[0]).toEqual([
        {
          userId: TALEBE,
          type: "SESSION_CANCELLED",
          targetType: "SESSION",
          targetId: SESSION,
          params: {
            courseId: COURSE,
            courseTitle: "Emsile",
            source: "Beyazıt Köşkü",
            sessionAt: cancelled.scheduledAt?.toISOString(),
          },
        },
      ]);
    });

    it("writes one notification per talebe in a single call", async () => {
      const { notifier, notify } = build([TALEBE, OTHER]);
      await notifier.sessionCancelled(session(), MUDERRIS);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(
        notify.mock.calls[0].map((n: { userId: string }) => n.userId)
      ).toEqual([TALEBE, OTHER]);
    });

    it("stays silent for a session that has no time or is already over", async () => {
      const { notifier, notify } = build();
      await notifier.sessionCancelled(session({ scheduledAt: null }));
      await notifier.sessionCancelled(
        session({ scheduledAt: inHours(-3), durationMinutes: 60 })
      );
      expect(notify).not.toHaveBeenCalled();
    });

    it("tells of a session moved from one time to another, with both times", async () => {
      const { notifier, notify } = build([TALEBE]);
      const previousAt = inHours(24);
      const moved = session({ scheduledAt: inHours(48) });
      await notifier.sessionRescheduled(previousAt, moved, MUDERRIS);
      expect(notify.mock.calls[0][0]).toMatchObject({
        type: "SESSION_RESCHEDULED",
        params: {
          sessionAt: moved.scheduledAt?.toISOString(),
          previousAt: previousAt.toISOString(),
        },
      });
    });

    it("stays silent when the time did not change, was set for the first time, or moved into the past", async () => {
      const { notifier, notify } = build();
      const at = inHours(24);
      await notifier.sessionRescheduled(
        new Date(at),
        session({ scheduledAt: at })
      );
      await notifier.sessionRescheduled(null, session());
      await notifier.sessionRescheduled(
        inHours(24),
        session({ scheduledAt: inHours(-5) })
      );
      await notifier.sessionRescheduled(
        inHours(24),
        session({ scheduledAt: inHours(48), cancelledAt: new Date() })
      );
      expect(notify).not.toHaveBeenCalled();
    });
  });
});
