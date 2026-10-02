import { applyDecorators } from "@nestjs/common";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

/**
 * The validation rules of a köşk's editable fields, shared by
 * `CreateKoskDto` and `UpdateKoskDto` so the two cannot drift (MDRS-108).
 * Each DTO adds its own presence rule and Swagger metadata on top.
 */

/** What `kosks.level` holds; tedris labels exactly these four. */
export const KOSK_LEVELS = [
  "ALL",
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
] as const;
export type KoskLevel = (typeof KOSK_LEVELS)[number];

export const KOSK_NAME_MIN = 2;
export const KOSK_NAME_MAX = 120;
export const KOSK_HANDLE_MAX = 60;
export const KOSK_DESCRIPTION_MAX = 1000;
export const KOSK_FIELD_MAX = 60;
export const KOSK_HUE_MAX = 360;
export const KOSK_TAGS_MAX = 10;
export const KOSK_TAG_MAX = 40;
/** How many nazımları a köşk can be opened with at once (nizam/10). */
export const KOSK_MANAGERS_MAX = 10;

/**
 * Optional, but never null: `@IsOptional()` skips validation for `null` as
 * well as `undefined`, so a NOT NULL column declared with it would let
 * `{"coverHue": null}` through to Postgres and answer 500 instead of 400 —
 * the same reasoning as `UpdateLessonDto`. The nullable columns (handle,
 * description, field, level) use `@IsOptional()`, where null clears them.
 */
export const OmittedButNotNull = () =>
  ValidateIf((_: unknown, value: unknown) => value !== undefined);

export const KoskNameRules = () =>
  applyDecorators(
    IsString(),
    MinLength(KOSK_NAME_MIN),
    MaxLength(KOSK_NAME_MAX)
  );

export const KoskHandleRules = () =>
  applyDecorators(IsString(), MaxLength(KOSK_HANDLE_MAX));

export const KoskDescriptionRules = () =>
  applyDecorators(IsString(), MaxLength(KOSK_DESCRIPTION_MAX));

export const KoskCoverHueRules = () =>
  applyDecorators(IsInt(), Min(0), Max(KOSK_HUE_MAX));

export const KoskIsPrivateRules = () => applyDecorators(IsBoolean());

export const KoskPolicyRules = () => applyDecorators(IsBoolean());

export const KoskFieldRules = () =>
  applyDecorators(IsString(), MaxLength(KOSK_FIELD_MAX));

export const KoskLevelRules = () => applyDecorators(IsIn(KOSK_LEVELS));

/**
 * Up to ten distinct tags, none blank, of at most forty characters. Before
 * MDRS-108 the list was unbounded, so one request could store any number of
 * strings of any length on a row every köşk listing returns.
 */
export const KoskTagsRules = () =>
  applyDecorators(
    IsArray(),
    ArrayMaxSize(KOSK_TAGS_MAX),
    ArrayUnique(),
    IsString({ each: true }),
    Matches(/\S/, { each: true }),
    MaxLength(KOSK_TAG_MAX, { each: true })
  );
