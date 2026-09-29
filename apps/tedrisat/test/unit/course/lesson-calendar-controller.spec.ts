import type { ConfigService } from "@nestjs/config";
import type { CourseService } from "../../../src/course/course.service";
import { CalendarNotConfiguredError } from "../../../src/course/errors/calendar-not-configured.error";
import type { AuthorizedRequest } from "../../../src/course/interfaces/authorized-request.interface";
import { LessonController } from "../../../src/course/lesson.controller";

/**
 * MDRS-117. The unconfigured branch cannot be reached from an e2e suite: the
 * config factory runs once per file, when AppModule is first imported.
 */
describe("LessonController.calendar without TEDRIS_WEB_URL", () => {
  it("answers 503 before looking the lesson up", async () => {
    const getScheduledLesson = vi.fn();
    const controller = new LessonController(
      { getScheduledLesson } as unknown as CourseService,
      { get: () => null } as unknown as ConfigService
    );

    const call = controller.calendar(
      { user: { sub: "u", preferred_username: "u" } } as AuthorizedRequest,
      "5b0f6c1e-7a3d-4f2b-9c51-2d8e4a6b1f00",
      undefined
    );

    await expect(call).rejects.toBeInstanceOf(CalendarNotConfiguredError);
    await expect(call).rejects.toHaveProperty("status", 503);
    expect(getScheduledLesson).not.toHaveBeenCalled();
  });
});
