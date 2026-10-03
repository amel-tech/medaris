import {
  type CoverTone,
  coverLabelText,
  toneOfHue,
} from "@medaris/ui/mds/cover-pattern";

/**
 * A course's bookcloth as the design draws it: the tone its `coverHue` was
 * saved as, and the Arabic of its `coverLabel` (الصرف, السيرة …). A summary
 * that carries no label prints none.
 */
export const courseCover = (course: {
  coverHue: number;
  coverLabel?: string | null;
}): { tone: CoverTone; label?: string } => ({
  tone: toneOfHue(course.coverHue),
  label: coverLabelText(course.coverLabel),
});
