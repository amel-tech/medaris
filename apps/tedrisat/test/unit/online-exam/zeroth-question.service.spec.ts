import type { AuthenticatedUser } from "@medaris/common";
import { describe, expect, it, vi } from "vitest";
import type { CourseService } from "../../../src/course/course.service";
import type {
  ICourseZeroth,
  ZerothQuestionRepository,
} from "../../../src/online-exam/zeroth-question.repository";
import { ZerothQuestionService } from "../../../src/online-exam/zeroth-question.service";

const at = new Date("2026-11-22T10:00:00Z");
const question = (text: string) => ({
  text,
  options: ["Bir", "İki"],
  updatedAt: at,
});
const user = { sub: "u-1" } as AuthenticatedUser;

const serviceOf = (zeroth: ICourseZeroth) => {
  const repo = {
    findForCourseOrMadrasah: vi.fn(async () => zeroth),
  } as unknown as ZerothQuestionRepository;
  const courses = {
    getDetail: vi.fn(async () => ({})),
  } as unknown as CourseService;
  return new ZerothQuestionService(repo, courses);
};

/** Which question a course's exams ask (MDRS-299): its own, else its medrese's. */
describe("ZerothQuestionService.getForCourse", () => {
  it("names the course's own when it has one, over the medrese's", async () => {
    const read = await serviceOf({
      own: question("Dersin"),
      madrasah: question("Medresenin"),
      inMadrasah: true,
    }).getForCourse("c-1", user);
    expect(read).toEqual({
      own: {
        text: "Dersin",
        options: ["Bir", "İki"],
        updatedAt: at.toISOString(),
      },
      madrasah: {
        text: "Medresenin",
        options: ["Bir", "İki"],
        updatedAt: at.toISOString(),
      },
      applies: "COURSE",
      inMadrasah: true,
    });
  });

  it("falls back on the medrese's", async () => {
    const read = await serviceOf({
      own: null,
      madrasah: question("Medresenin"),
      inMadrasah: true,
    }).getForCourse("c-1", user);
    expect(read.applies).toBe("MADRASAH");
    expect(read.own).toBeNull();
  });

  it("names none for a köşk's own course with no question of its own", async () => {
    const read = await serviceOf({
      own: null,
      madrasah: null,
      inMadrasah: false,
    }).getForCourse("c-1", user);
    expect(read).toEqual({
      own: null,
      madrasah: null,
      applies: "NONE",
      inMadrasah: false,
    });
  });
});
