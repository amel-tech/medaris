type Translate = (
  key: string,
  values?: Record<string, string | number>
) => string;

export const levelLabel = (level: string, t: Translate): string =>
  t(`Levels.${level}`);

export const lessonTypeLabel = (type: string, t: Translate): string =>
  t(`LessonTypes.${type}`);

/**
 * "Başlangıç seviyesi" for a köşk (MDRS-159): its `level` as the page's own
 * words, `ALL` as "Bütün seviyeler", and nothing for a köşk that set none.
 * `scope` is the namespace that holds `level` and `levelAll` (DiscoverPage and
 * KoskPage carry the same two keys).
 */
export const koskLevelLabel = (
  level: string | null | undefined,
  t: Translate,
  scope: "DiscoverPage" | "KoskPage"
): string | null => {
  if (!level) return null;
  if (level === "ALL") return t(`${scope}.levelAll`);
  if (["BEGINNER", "INTERMEDIATE", "ADVANCED"].includes(level)) {
    return t(`${scope}.level`, { level });
  }
  return null;
};
