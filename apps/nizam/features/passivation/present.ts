import type {
  PassivationImpactResponse,
  PassivationScopeType,
} from "@medaris/services/tedrisat";

/** What the dialog is doing: reading the preview, showing it, or saving. */
export type PassivationState =
  | { kind: "loading" }
  | { kind: "failed" }
  | {
      kind: "ready";
      impact: PassivationImpactResponse;
      /** The numbers were replaced after the person confirmed ones that went stale. */
      changed: boolean;
      saving: boolean;
    };

/** A sentence of the warning: the `nizam.PassivateScopeDialog` key and what it fills in. */
export interface ImpactLine {
  key:
    | "staffKosk"
    | "staffMadrasah"
    | "noStaffKosk"
    | "noStaffMadrasah"
    | "courses"
    | "coursesLive"
    | "coursesNone"
    | "students"
    | "studentsCompleted"
    | "sessions"
    | "sessionsNone"
    | "neverAttended";
  values?: Record<string, number>;
}

/**
 * The warning, sentence by sentence, from the numbers the API measured. A
 * scope that never had a manager closes nothing, so it gets the honest
 * sentence instead of a list of courses that would not close.
 */
export function impactLines(
  impact: PassivationImpactResponse,
  kind: PassivationScopeType
): ImpactLine[] {
  const lines: ImpactLine[] =
    impact.staffLeaving > 0
      ? [
          kind === "KOSK"
            ? { key: "staffKosk", values: { count: impact.staffLeaving } }
            : { key: "staffMadrasah" },
        ]
      : [{ key: kind === "KOSK" ? "noStaffKosk" : "noStaffMadrasah" }];
  if (!impact.closesContent) return [...lines, { key: "neverAttended" }];

  const { courses, students, sessions } = impact;
  if (courses.total === 0) {
    lines.push({ key: "coursesNone" });
  } else {
    lines.push({
      key: "courses",
      values: {
        count: courses.total,
        published: courses.published,
        draft: courses.draft,
      },
    });
    lines.push({
      key: "coursesLive",
      values: { count: courses.withLiveMuderris },
    });
  }
  if (students.enrolled > 0) {
    lines.push({ key: "students", values: { count: students.enrolled } });
  }
  if (students.completed > 0) {
    lines.push({
      key: "studentsCompleted",
      values: { count: students.completed },
    });
  }
  lines.push(
    sessions.count > 0
      ? {
          key: "sessions",
          values: { days: sessions.windowDays, count: sessions.count },
        }
      : { key: "sessionsNone", values: { days: sessions.windowDays } }
  );
  return lines;
}

/** How many courses the list leaves out, for "ve N ders daha"; the API listed only the first. */
export const hiddenCourseCount = (impact: PassivationImpactResponse): number =>
  Math.max(0, impact.courses.total - impact.courses.items.length);

/**
 * Whether the confirm button works: the numbers are on screen and nothing is
 * being saved. After a stale confirmation the new numbers are on screen with
 * their own token, so it works again: the person has read them and chooses.
 */
export function canConfirm(state: PassivationState): boolean {
  return (
    state.kind === "ready" && !state.saving && !state.impact.alreadyPassive
  );
}

const codeOf = (errorBody: unknown): string =>
  errorBody && typeof errorBody === "object" && "code" in errorBody
    ? String((errorBody as { code: unknown }).code)
    : "";

const KNOWN: Record<string, string> = {
  KOSK_ALREADY_PASSIVE: "errors.alreadyPassive",
  MADRASAH_ALREADY_PASSIVE: "errors.alreadyPassive",
  PASSIVATION_IMPACT_CHANGED: "errors.changed",
  KOSK_NOT_FOUND: "errors.notFound",
  MADRASAH_NOT_FOUND: "errors.notFound",
  AUTHZ_FORBIDDEN: "errors.forbidden",
};

/** The `nizam.PassivateScopeDialog` key for a refusal's code, or the generic one. */
export function passivationErrorKey(errorBody: unknown): string {
  return KNOWN[codeOf(errorBody)] ?? "errors.generic";
}

/**
 * The fresh preview a 409 PASSIVATION_IMPACT_CHANGED carries in
 * `context.impact`, or null for any other refusal (or a body without one).
 */
export function changedImpact(
  errorBody: unknown
): PassivationImpactResponse | null {
  if (codeOf(errorBody) !== "PASSIVATION_IMPACT_CHANGED") return null;
  const impact = (errorBody as { context?: { impact?: unknown } }).context
    ?.impact;
  return impact &&
    typeof impact === "object" &&
    typeof (impact as { confirmation?: unknown }).confirmation === "string"
    ? (impact as PassivationImpactResponse)
    : null;
}
