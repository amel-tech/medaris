import { cache } from "react";
import { getCourse } from "./actions";

/**
 * One read of the course per request, shared by the segment layout (which
 * answers a real 404 before any byte streams) and the page.
 */
export const loadCourse = cache(getCourse);
