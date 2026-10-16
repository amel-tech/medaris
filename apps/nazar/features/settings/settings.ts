import type {
  MadrasahCourseListItemResponse,
  MadrasahSettingsResponse,
  UpdateMadrasahSettingsDto,
} from "@medaris/services/tedrisat";
import { showsImamStar } from "@medaris/ui/lib/imam-star";
import type { IconName } from "@medaris/ui/mds/icon";
import { formatHocaName } from "@medaris/utils";

/**
 * Medrese ayarları (nazir 04) as rules, so that what the form allows, what
 * Kaydet sends and what the side panels say are exercised without a server.
 */
export const NAME_MIN = 2;
export const NAME_MAX = 120;
export const DESCRIPTION_MAX = 1000;

/** The three policies, in the order the screen lists them, each with its glyph. */
export const POLICY_ICONS = {
  closedCourseRequired: "lock",
  alwaysApproval: "shieldCheck",
  noPublicRecordings: "eyeOff",
} as const satisfies Record<string, IconName>;

export type PolicyKey = keyof typeof POLICY_ICONS;
export const POLICY_KEYS = Object.keys(POLICY_ICONS) as PolicyKey[];

export type Policies = Record<PolicyKey, boolean>;

/** What the form holds: the text as typed and the three choices. */
export interface SettingsForm {
  name: string;
  /** "" for none */
  description: string;
  policies: Policies;
}

/** The last save as the browser keeps it: the form it left and who saved when. */
export interface SettingsSnapshot {
  form: SettingsForm;
  updatedAt: string | null;
  updatedBy: string | null;
}

export const snapshotOf = (
  settings: MadrasahSettingsResponse
): SettingsSnapshot => ({
  form: {
    name: settings.name,
    description: settings.description ?? "",
    policies: {
      closedCourseRequired: settings.policies.closedCourseRequired,
      alwaysApproval: settings.policies.alwaysApproval,
      noPublicRecordings: settings.policies.noPublicRecordings,
    },
  },
  updatedAt: settings.updatedAt
    ? new Date(settings.updatedAt).toISOString()
    : null,
  updatedBy: settings.updatedBy?.name ?? settings.updatedBy?.email ?? null,
});

export type NameProblem = "required" | "short" | "long";

/** The first thing wrong with the name: blank, too short or too long, as the API counts it (trimmed). */
export function nameProblem(name: string): NameProblem | null {
  const length = name.trim().length;
  if (length === 0) return "required";
  if (length < NAME_MIN) return "short";
  return length > NAME_MAX ? "long" : null;
}

export const descriptionTooLong = (description: string): boolean =>
  description.trim().length > DESCRIPTION_MAX;

export const formValid = (form: SettingsForm): boolean =>
  nameProblem(form.name) === null && !descriptionTooLong(form.description);

/**
 * The body Kaydet sends: only what differs from the last save, trimmed, and a
 * blank description as `null` (which clears it). `null` when nothing differs,
 * which is also when Kaydet stays off.
 */
export function settingsPatch(
  saved: SettingsForm,
  draft: SettingsForm
): UpdateMadrasahSettingsDto | null {
  const patch: UpdateMadrasahSettingsDto = {};
  const name = draft.name.trim();
  if (name !== saved.name.trim()) patch.name = name;
  const description = draft.description.trim();
  if (description !== saved.description.trim()) {
    patch.description = description === "" ? null : description;
  }
  const changed = POLICY_KEYS.filter(
    (key) => draft.policies[key] !== saved.policies[key]
  );
  if (changed.length > 0) {
    patch.policies = Object.fromEntries(
      changed.map((key) => [key, draft.policies[key]])
    );
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/** The message key of the line under the toast's title, from the code the API answered with. */
export function saveFailedKey(code: string): string {
  if (code === "VALIDATION_ERROR") return "Settings.saveFailedInvalid";
  return code === "AUTHZ_FORBIDDEN"
    ? "Problems.actionForbidden"
    : "Problems.actionGeneric";
}

/**
 * The four levels a permission has to be open at (nazir 04, "Politikalar nasıl
 * birleşir"), widest first. Only the medrese's own is set on this screen; the
 * others are named so the reader sees what else can close a permission.
 */
export const POLICY_TIERS = [
  { id: "medaris", icon: "globe" },
  { id: "kosk", icon: "kosk" },
  { id: "medrese", icon: "medrese" },
  { id: "ders", icon: "courses" },
] as const satisfies ReadonlyArray<{ id: string; icon: IconName }>;

/** A run of the line below: text, and whether the imam's star follows it. */
export interface MetaPart {
  text: string;
  imam: boolean;
}

/**
 * The second line of a course in "Politikaların uygulandığı dersler": its
 * köşk, then its müderrisler ("A ve B", each with the unvan they carry in the
 * course: "Prof. Dr. A ve B Hoca"), the imam's name followed by the star
 * where there is more than one (2026-10-13). In runs, so the page can set the
 * star after the name the list put in its place.
 */
export function courseMeta(
  course: Pick<MadrasahCourseListItemResponse, "koskName" | "muderris">,
  words: { locale: string }
): MetaPart[] {
  const team = course.muderris;
  let next = 0;
  const names: MetaPart[] =
    team.length > 0
      ? new Intl.ListFormat(words.locale, {
          style: "long",
          type: "conjunction",
        })
          .formatToParts(team.map((m) => formatHocaName(m.name, m.unvan)))
          .map((part) => {
            if (part.type === "literal")
              return { text: part.value, imam: false };
            const m = team[next++];
            return {
              text: part.value,
              imam: showsImamStar(m?.isImam ?? false, team.length),
            };
          })
      : [];
  const kosk = course.koskName ? [{ text: course.koskName, imam: false }] : [];
  return kosk.length > 0 && names.length > 0
    ? [...kosk, { text: " · ", imam: false }, ...names]
    : [...kosk, ...names];
}

/**
 * Where "Medrese sayfasını gör" goes: the medrese's public page in Tedris,
 * whose address is the app's `TEDRIS_URL`. Nazar is Turkish only, so the page
 * is the Turkish one. `null` when Tedris's address is not set.
 */
export function medresePageUrl(
  tedris: string | null | undefined,
  madrasahId: string
): string | null {
  if (!tedris) return null;
  return new URL(
    `/tr/madrasahs/${encodeURIComponent(madrasahId)}`,
    tedris
  ).toString();
}
