import type { AuthenticatedUser } from "@medaris/common";
import { ExcelService } from "@medaris/common";
import { Injectable, type StreamableFile } from "@nestjs/common";
import { toCalendarLocale } from "../course/calendar/lesson-calendar";
import { CourseService } from "../course/course.service";
import { EvaluationStatus } from "../course/domain/assignment-kind.enum";
import { ExamRepository } from "../exam/exam.repository";
import {
  type EvaluationBoardResponse,
  EvaluationColumnKind,
  type EvaluationMarkResponse,
  type OwnEvaluationResponse,
} from "./dto/evaluation.dto";
import { EvaluationForbiddenError } from "./errors/evaluation-forbidden.error";
import { EvaluationRepository } from "./evaluation.repository";

/** The words of "Excel indir", in the three languages Medaris speaks. */
const EXPORT_WORDS = {
  tr: {
    sheet: "Değerlendirme",
    name: "Ad Soyad",
    unnamed: "Adsız talebe",
    week: (n: number) => `${n}. hafta`,
    memorize: "Ezber",
    exam: "Sınav",
    retake: "Telafi",
    pending: "Bekliyor",
    absentExam: "Girmedi",
    status: { FULL: "Tam", INCOMPLETE: "Eksik", ABSENT: "Vermedi" },
  },
  en: {
    sheet: "Evaluation",
    name: "Name",
    unnamed: "Unnamed talebe",
    week: (n: number) => `Week ${n}`,
    memorize: "Memorisation",
    exam: "Exam",
    retake: "Make-up",
    pending: "Pending",
    absentExam: "Absent",
    status: { FULL: "Full", INCOMPLETE: "Incomplete", ABSENT: "Not recited" },
  },
  ar: {
    sheet: "التقييم",
    name: "الاسم",
    unnamed: "طالب بلا اسم",
    week: (n: number) => `الأسبوع ${n}`,
    memorize: "حفظ",
    exam: "اختبار",
    retake: "تعويضي",
    pending: "قيد الانتظار",
    absentExam: "غائب",
    status: { FULL: "تام", INCOMPLETE: "ناقص", ABSENT: "لم يُسمِّع" },
  },
} as const;

/**
 * "Değerlendirme" (MDRS-248): the course team marks each talebe on a homework
 * recited to them, "Tam", "Eksik" or "Vermedi" with an optional short note,
 * and the talebe reads their own mark on the session page.
 *
 * The course team is whoever holds `session.manage` on the course (the
 * routes' `@Authz`): the müderris by role, a ders nazırı when given it, the
 * başnazım. The board opens on the course's terms for its page (`getDetail`:
 * a hidden course or a draft is not found); a mark is written on a live
 * session of a course the caller may write to (`findWritableLessonCourse`),
 * to a talebe seated in it. A talebe reads only their own mark, on the terms
 * of their own homework (`mayReachOwnWriting`): nobody else's is reachable
 * through that route, and the course team reads marks on the board.
 */
@Injectable()
export class EvaluationService {
  // All must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: EvaluationRepository,
    private readonly courses: CourseService,
    private readonly exams: ExamRepository,
    private readonly excel: ExcelService
  ) {}

  async board(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<EvaluationBoardResponse> {
    await this.courses.getDetail(courseId, user, { read: true });
    const [columns, exams, talebe] = await Promise.all([
      this.repo.listColumns(courseId),
      this.exams.listColumns(courseId),
      this.repo.listTalebe(courseId),
    ]);
    const seated = new Set(talebe.map((t) => t.id));
    // A mark or a result of somebody no longer seated stays kept but is not shown.
    const [marks, results] = await Promise.all([
      this.repo
        .listMarks(columns)
        .then((all) => all.filter((mark) => seated.has(mark.userId))),
      this.exams
        .listResults(exams)
        .then((all) => all.filter((result) => seated.has(result.userId))),
    ]);
    const placed = [
      ...columns.map((column) => ({
        order: [column.weekNumber, column.orderIndex] as const,
        column: {
          kind: EvaluationColumnKind.MEMORIZE,
          lessonId: column.lessonId,
          title: column.title,
          weekNumber: column.weekNumber,
          scheduledAt: column.scheduledAt,
          description: column.description,
          fullCount: marks.filter(
            (mark) =>
              mark.lessonId === column.lessonId &&
              mark.status === EvaluationStatus.FULL
          ).length,
          exam: null,
        },
      })),
      ...exams.map((exam) => ({
        order: [exam.weekNumber, exam.orderIndex] as const,
        column: {
          kind: EvaluationColumnKind.EXAM,
          lessonId: exam.lessonId,
          title: exam.title,
          weekNumber: exam.weekNumber,
          scheduledAt: exam.scheduledAt,
          description: null,
          fullCount: results.filter((r) => r.lessonId === exam.lessonId).length,
          exam: {
            format: exam.format,
            maxScore: exam.maxScore,
            isRetake: exam.isRetake,
            resultsReleasedAt: exam.resultsReleasedAt,
          },
        },
      })),
    ];
    // In programme order, as each list already is.
    placed.sort(
      (a, b) =>
        a.order[0] - b.order[0] ||
        a.order[1] - b.order[1] ||
        a.column.lessonId.localeCompare(b.column.lessonId)
    );
    return {
      columns: placed.map((p) => p.column),
      talebe,
      marks,
      results,
    };
  }

  /**
   * "Excel indir" (MDRS-248): the board as a sheet, a row per talebe ("Ad
   * Soyad") and a column per memorisation homework and exam, in the
   * caller's language. Cells are written through `ExcelService`, which
   * neutralises anything a spreadsheet would read as a formula.
   */
  async exportBoard(
    user: AuthenticatedUser,
    courseId: string,
    lang: string | undefined
  ): Promise<StreamableFile> {
    const board = await this.board(user, courseId);
    const words = EXPORT_WORDS[toCalendarLocale(lang)];
    const header = (column: EvaluationBoardResponse["columns"][number]) => {
      const title = `${words.week(column.weekNumber)} · ${column.title}`;
      if (column.kind !== EvaluationColumnKind.EXAM || !column.exam) {
        return `${title} (${words.memorize})`;
      }
      return `${title} (${column.exam.isRetake ? words.retake : words.exam} /${column.exam.maxScore})`;
    };
    const markOf = new Map(
      board.marks.map((m) => [`${m.lessonId}:${m.userId}`, m.status])
    );
    const resultOf = new Map(
      board.results.map((r) => [`${r.lessonId}:${r.userId}`, r])
    );
    type Row = Record<string, string | number>;
    const rows: Row[] = board.talebe.map((t) => {
      const row: Row = { name: t.name ?? words.unnamed };
      board.columns.forEach((column, index) => {
        const key = `${column.lessonId}:${t.id}`;
        if (column.kind === EvaluationColumnKind.EXAM) {
          const result = resultOf.get(key);
          row[`c${index}`] = !result
            ? ""
            : result.absent
              ? words.absentExam
              : (result.score ?? "");
        } else {
          const status = markOf.get(key);
          row[`c${index}`] = status ? words.status[status] : words.pending;
        }
      });
      return row;
    });
    return this.excel.exportData<Row>(
      rows,
      {
        sheetName: words.sheet,
        columns: [
          { key: "name", header: words.name, width: 28 },
          ...board.columns.map((column, index) => ({
            key: `c${index}`,
            header: header(column),
            width: 24,
          })),
        ],
      },
      "degerlendirme"
    );
  }

  async save(
    user: AuthenticatedUser,
    lessonId: string,
    userId: string,
    status: EvaluationStatus,
    note: string | null
  ): Promise<EvaluationMarkResponse> {
    const courseId = await this.courses.findWritableLessonCourse(
      lessonId,
      user
    );
    return this.repo.save(lessonId, userId, status, note, {
      courseId,
      actorId: user.sub,
    });
  }

  async own(
    user: AuthenticatedUser,
    lessonId: string
  ): Promise<OwnEvaluationResponse> {
    const courseId = await this.courses.findVisibleLessonCourse(lessonId, user);
    if (!(await this.courses.mayReachOwnWriting(user, courseId))) {
      throw new EvaluationForbiddenError();
    }
    const mark = await this.repo.findOwn(lessonId, user.sub);
    return {
      status: mark?.status ?? null,
      note: mark?.note ?? null,
      updatedAt: mark?.updatedAt ?? null,
    };
  }
}
