/**
 * The message key (under `tedris.CoursePage`) for a failed course action.
 * The API's own text is English and carries ids, so the page says it in its
 * own words, by what the status means.
 */
export const courseActionErrorKey = (
  status: number | undefined
): "actionNotFound" | "actionConflict" | "actionFailed" => {
  if (status === 404) return "actionNotFound";
  if (status === 409) return "actionConflict";
  return "actionFailed";
};
