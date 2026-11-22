import {
  type AuthenticatedUser,
  AuthzForbiddenError,
  AuthzService,
  ENTITIES,
  PERMISSIONS,
  ValidationError,
} from "@medaris/common";
import { Injectable } from "@nestjs/common";
import {
  isSystemAdmin,
  PlatformAccessService,
} from "../platform-access/platform-access.service";
import { maskQuestion, maskTable, zerothKey } from "./domain/zeroth-counts";
import type {
  ZerothAnswerCountsResponse,
  ZerothAnswersQuery,
  ZerothQuestionExamsResponse,
} from "./dto/zeroth-answers.dto";
import { ZerothQuestionNotFoundError } from "./errors/zeroth-answers.errors";
import {
  type IZerothExamRow,
  ZerothAnswersRepository,
} from "./zeroth-answers.repository";

const CODE = PERMISSIONS.EXAM_ZEROTH_READ;

/** The exams of one zeroth question: the same words with the same options. */
interface IGroup {
  key: string;
  question: string;
  options: string[];
  /** newest first */
  exams: IZerothExamRow[];
}

/** Groups the exams by their question, in the order of each question's newest exam. */
function groupOf(exams: readonly IZerothExamRow[]): IGroup[] {
  const groups = new Map<string, IGroup>();
  for (const exam of exams) {
    const options = exam.options.map((o) => o.text.trim());
    const key = zerothKey(exam.question, options);
    const group = groups.get(key) ?? {
      key,
      question: exam.question.trim(),
      options,
      exams: [],
    };
    group.exams.push(exam);
    groups.set(key, group);
  }
  return [...groups.values()];
}

const sumOf = (group: IGroup) => {
  const options = group.options.map((_, j) =>
    group.exams.reduce((sum, exam) => sum + (exam.options[j]?.count ?? 0), 0)
  );
  return { options, answered: options.reduce((a, b) => a + b, 0) };
};

/**
 * nizam's "Sıfırıncı soru cevapları" (MDRS-299): how the zeroth question of
 * the online exams was answered, in aggregate. No route guard can say "in the
 * platform or in some köşk of mine", so the service decides, as the audit
 * trail's does: platform management that holds `exam.zeroth_read` (and the
 * başnazım) reads every köşk, a köşk nazımı their own köşk, and everyone else
 * is a 403. Every read goes on the record.
 */
@Injectable()
export class ZerothAnswersService {
  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: ZerothAnswersRepository,
    private readonly authz: AuthzService,
    private readonly platform: PlatformAccessService
  ) {}

  async counts(
    user: AuthenticatedUser,
    query: ZerothAnswersQuery
  ): Promise<ZerothAnswerCountsResponse> {
    const { filter, every } = await this.filterOf(user, query);
    const [exams, courses] = await Promise.all([
      this.repo.exams(filter),
      this.repo.courses(filter.koskIds),
    ]);
    const groups = groupOf(exams);
    await this.record(user, query, { questions: groups.length });
    return {
      questions: groups.map((group) => {
        const sums = sumOf(group);
        const counts = maskQuestion(sums.answered, sums.options);
        return {
          questionKey: group.key,
          question: group.question,
          exams: group.exams.length,
          answered: counts.answered,
          options: group.options.map((text, j) => ({
            text,
            count: counts.options[j],
          })),
        };
      }),
      courses,
      everyKosk: every,
    };
  }

  async questionExams(
    user: AuthenticatedUser,
    questionKey: string,
    query: ZerothAnswersQuery
  ): Promise<ZerothQuestionExamsResponse> {
    const { filter } = await this.filterOf(user, query);
    const group = groupOf(await this.repo.exams(filter)).find(
      (g) => g.key === questionKey
    );
    if (!group) throw new ZerothQuestionNotFoundError(questionKey);
    const table = maskTable(
      group.exams.map((exam) =>
        group.options.map((_, j) => exam.options[j]?.count ?? 0)
      )
    );
    await this.record(user, query, { questionKey });
    return {
      questionKey,
      question: group.question,
      answered: table.answered,
      options: group.options.map((text, j) => ({
        text,
        count: table.options[j],
      })),
      exams: group.exams.map((exam, i) => ({
        examId: exam.examId,
        courseTitle: exam.courseTitle,
        koskName: exam.koskName,
        startsAt: exam.startsAt,
        answered: table.exams[i].answered,
        options: table.exams[i].options,
      })),
    };
  }

  /** The span checked and the köşks the caller reads; a 403 when none. */
  private async filterOf(user: AuthenticatedUser, query: ZerothAnswersQuery) {
    if (query.to.getTime() < query.from.getTime()) {
      throw new ValidationError("The span ends before it starts", {
        errors: [{ property: "to", constraints: { span: "to >= from" } }],
      });
    }
    const every =
      isSystemAdmin(user) || (await this.platform.holds(user.sub, CODE));
    let koskIds: string[] | null = null;
    if (query.koskId) {
      if (!every && !(await this.holdsIn(user, query.koskId))) {
        throw new AuthzForbiddenError(
          `${CODE} is not held in the platform or in köşk ${query.koskId}`
        );
      }
      koskIds = [query.koskId];
    } else if (!every) {
      koskIds = [];
      for (const id of await this.repo.koskCandidates(user.sub)) {
        if (await this.holdsIn(user, id)) koskIds.push(id);
      }
      if (koskIds.length === 0) {
        throw new AuthzForbiddenError(
          `${CODE} is held neither in the platform nor in a köşk`
        );
      }
    }
    return {
      every,
      filter: {
        from: query.from,
        to: query.to,
        koskIds,
        madrasahId: query.madrasahId,
        courseId: query.courseId,
      },
    };
  }

  private holdsIn(user: AuthenticatedUser, koskId: string): Promise<boolean> {
    return this.authz.can(user, { entity: ENTITIES.KOSK, id: koskId }, CODE);
  }

  private record(
    user: AuthenticatedUser,
    query: ZerothAnswersQuery,
    extra: Record<string, unknown>
  ): Promise<void> {
    return this.repo.recordRead({
      actorId: user.sub,
      entityId: user.sub,
      details: {
        from: query.from.toISOString(),
        to: query.to.toISOString(),
        ...(query.koskId ? { koskId: query.koskId } : {}),
        ...(query.madrasahId ? { madrasahId: query.madrasahId } : {}),
        ...(query.courseId ? { courseId: query.courseId } : {}),
        ...extra,
      },
    });
  }
}
