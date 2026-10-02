import {
  ArchiveApi,
  BansApi,
  Configuration,
  CoursesApi,
  FlashcardCardsApi,
  FlashcardDeckLabelApi,
  FlashcardDecksApi,
  FlashcardlabelApi,
  KosksApi,
  LessonsApi,
  MadrasahsApi,
  MeApi,
  NizamApi,
  NotificationsApi,
  SessionsApi,
  TedrisatServiceApi,
  UsersApi,
} from "./generated/src";

// Re-export types that are used in other apps
export type {
  ArchiveImpactResponse,
  ArchiveItemResponse,
  ArchiveItemType,
  ArchiveRestoreResponse,
  ArchiverResponse,
  ArchiveScopesResponse,
  AssignmentResponse,
  BanListResponse,
  BanPersonResponse,
  BanResponse,
  BanScope,
  ChiefNazimResponse,
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
  EffectivePermissionGroup,
  EnrolledCourseResponse,
  EnrollmentBanResponse,
  EnrollmentResponse,
  FlashcardCreateLabelResponse,
  FlashcardDeckCreateLabelResponse,
  FlashcardDeckExploreResponse,
  FlashcardDeckLabelingResponse,
  FlashcardDeckLabelResponse,
  FlashcardDeckResponse,
  FlashcardDeckSummaryResponse,
  FlashcardLabelingResponse,
  FlashcardLabelResponse,
  FlashcardProgressResponse,
  FlashcardResponse,
  FlashcardStudyRoundResponse,
  FollowedKoskCourseResponse,
  GrantResponse,
  KoskResponse,
  LabelStatsResponse,
  LessonMutationResponse,
  LessonResponse,
  MadrasahResponse,
  MeResponse,
  MuderrisResponse,
  MyAssignmentsResponse,
  MyEffectivePermissionsResponse,
  MyGrantsResponse,
  MyPermissionsResponse,
  MyRolesResponse,
  NotificationCountsResponse,
  NotificationResponse,
  PaginatedArchiveResponse,
  PaginatedKoskResponse,
  PaginatedMadrasahResponse,
  PaginatedNotificationResponse,
  PendingEnrollmentResponse,
  ReadAllNotificationsResponse,
  RemoveEnrollmentDto,
  ReplaceCourseDto,
  ResourceResponse,
  RosterEnrollmentResponse,
  ScheduleSessionResponse,
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
import { DeckCollectionKind } from "./generated/src/models/DeckCollectionKind";
import { DeckPublishStatus } from "./generated/src/models/DeckPublishStatus";
import { DeckSource } from "./generated/src/models/DeckSource";
import { EnrollmentResponseStatusEnum } from "./generated/src/models/EnrollmentResponse";
// Re-export enum constants (they are used at runtime as values)
import { FlashcardResponseTypeEnum } from "./generated/src/models/FlashcardResponse";
import { FlashcardType } from "./generated/src/models/FlashcardType";
import { ReviewRating } from "./generated/src/models/ReviewRating";
import { TeamSettableEnrollmentStatus } from "./generated/src/models/TeamSettableEnrollmentStatus";

export {
  DeckCollectionKind,
  DeckPublishStatus,
  DeckSource,
  FlashcardType,
  ReviewRating,
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
    // The medrese layer (MDRS-106); tedris' medrese page reads it (MDRS-122).
    madrasahs: new MadrasahsApi(configuration),
    courses: new CoursesApi(configuration),
    // Session-level lesson writes (MDRS-95).
    lessons: new LessonsApi(configuration),
    // The caller's own profile and settings (MDRS-104); the web apps read
    // `timeZone` from it to pick the zone dates are shown in (MDRS-110).
    me: new MeApi(configuration),
    // Exact e-mail lookup (MDRS-104) — nizam's müderris picker (MDRS-105).
    users: new UsersApi(configuration),
    // Who the Medaris başnazımı is, for the 'no access' screen (MDRS-169).
    nizam: new NizamApi(configuration),
    // The caller's in-app notifications (MDRS-167): the list page and the bell.
    notifications: new NotificationsApi(configuration),
    // The caller's own schedule: Programım and the phone menu's next session (MDRS-163).
    sessions: new SessionsApi(configuration),
    // Hidden things, brought back or deleted for real (MDRS-173).
    archive: new ArchiveApi(configuration),
    // Barring a talebe and lifting it (MDRS-177).
    bans: new BansApi(configuration),
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
