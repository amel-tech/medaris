import { MuderrisDuplicateUserError } from "../../course/errors/muderris-duplicate-user.error";
import { CourseImamNotListedError, CourseImamRequiredError } from "./errors";

/** The müderrisler of a course and the one who is its imam. */
export interface ICourseTeam {
  /** Lowercased, in the order the nazır listed them. */
  userIds: string[];
  imamUserId: string;
}

/**
 * The team a nazır's request describes (nazir/08, nazir/17), as plain data: a
 * lone müderris is the imam, with several the imam must be named and be one of
 * them, and no account is listed twice. The caller has already refused an empty
 * list.
 */
export function planCourseTeam(
  userIds: readonly string[],
  imamUserId?: string
): ICourseTeam {
  const ids = userIds.map((id) => id.toLowerCase());
  const duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
  if (duplicate) throw new MuderrisDuplicateUserError(duplicate);

  const imam = imamUserId?.toLowerCase();
  if (imam === undefined) {
    if (ids.length !== 1) throw new CourseImamRequiredError();
    return { userIds: ids, imamUserId: ids[0] };
  }
  if (!ids.includes(imam)) throw new CourseImamNotListedError(imam);
  return { userIds: ids, imamUserId: imam };
}
