import {
  Configuration,
  CoursesApi,
  FlashcardCardsApi,
  FlashcardDeckLabelApi,
  FlashcardDecksApi,
  FlashcardlabelApi,
  KosksApi,
  LessonsApi,
  MeApi,
  TedrisatServiceApi,
  UsersApi,
} from "./generated/src";

// Re-export types that are used in other apps
export type {
  CourseDetailResponse,
  CourseSummaryResponse,
  CreateCourseDto,
  CreateFlashcardDeckDto,
  CreateFlashcardDeckLabelDto,
  CreateFlashcardDeckLabelingDto,
  CreateFlashcardDto,
  CreateFlashcardLabelDto,
  CreateFlashcardLabelingDto,
  CreateKoskDto,
  CreateLessonDto,
  CreateMuderrisDto,
  CreateResourceDto,
  CreateWeekDto,
  CreateWeekLessonDto,
  DeckLabelStatsResponse,
  EnrolledCourseResponse,
  EnrollmentResponse,
  FlashcardCreateLabelResponse,
  FlashcardDeckCreateLabelResponse,
  FlashcardDeckLabelingResponse,
  FlashcardDeckLabelResponse,
  FlashcardDeckResponse,
  FlashcardLabelingResponse,
  FlashcardLabelResponse,
  FlashcardResponse,
  KoskResponse,
  LabelStatsResponse,
  LessonMutationResponse,
  LessonResponse,
  MeResponse,
  MuderrisResponse,
  PaginatedKoskResponse,
  PendingEnrollmentResponse,
  RemoveEnrollmentDto,
  ReplaceCourseDto,
  ResourceResponse,
  SetEnrollmentStatusDto,
  UpdateCourseDto,
  UpdateFlashcardDeckDto,
  UpdateFlashcardDto,
  UpdateKoskDto,
  UpdateLessonDto,
  UpdateProgressDto,
  UserSummaryResponse,
  WeekResponse,
} from "./generated/src";

import {
  CreateCourseDtoLevelEnum,
  CreateCourseDtoStatusEnum,
} from "./generated/src/models/CreateCourseDto";
import { CreateFlashcardDtoTypeEnum } from "./generated/src/models/CreateFlashcardDto";
import { CreateLessonDtoTypeEnum } from "./generated/src/models/CreateLessonDto";
import { EnrollmentResponseStatusEnum } from "./generated/src/models/EnrollmentResponse";
// Re-export enum constants (they are used at runtime as values)
import { FlashcardResponseTypeEnum } from "./generated/src/models/FlashcardResponse";
import { TeamSettableEnrollmentStatus } from "./generated/src/models/TeamSettableEnrollmentStatus";

export {
  FlashcardResponseTypeEnum,
  CreateFlashcardDtoTypeEnum,
  CreateLessonDtoTypeEnum,
  CreateCourseDtoLevelEnum,
  CreateCourseDtoStatusEnum,
  EnrollmentResponseStatusEnum,
  TeamSettableEnrollmentStatus,
};

export interface TedrisatAPIConfig {
  baseUrl: string;
  token?: string;
}

/**
 * Factory to create authenticated Tedrisat API clients
 * Direct usage of generated OpenAPI clients
 */
export function createTedrisatAPIs(config: TedrisatAPIConfig) {
  const configuration = new Configuration({
    basePath: config.baseUrl,
    headers: config.token
      ? {
          Authorization: `Bearer ${config.token}`,
        }
      : undefined,
  });

  return {
    decks: new FlashcardDecksApi(configuration),
    cards: new FlashcardCardsApi(configuration),
    service: new TedrisatServiceApi(configuration),
    kosks: new KosksApi(configuration),
    courses: new CoursesApi(configuration),
    // Session-level lesson writes (MDRS-95).
    lessons: new LessonsApi(configuration),
    // The caller's own profile and settings (MDRS-104); the web apps read
    // `timeZone` from it to pick the zone dates are shown in (MDRS-110).
    me: new MeApi(configuration),
    // Exact e-mail lookup (MDRS-104) — nizam's müderris picker (MDRS-105).
    users: new UsersApi(configuration),
    // The two label controllers MDRS-58 published for the first time. Generated
    // classes that only `./generated/src` exported were reachable by no app —
    // this factory is what `@medaris/services/tedrisat` hands out.
    labels: new FlashcardlabelApi(configuration),
    deckLabels: new FlashcardDeckLabelApi(configuration),
  };
}

/**
 * Convenience function for server-side usage with token
 */
export async function createServerTedrisatAPIs(
  token: string | undefined,
  baseUrl: string
) {
  return createTedrisatAPIs({ baseUrl, token });
}
