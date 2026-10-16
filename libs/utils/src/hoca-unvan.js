// The unvan (title) a hoca carries in one course, and the name it makes: one
// list of codes for tedrisat, which stores and validates the code, and the
// web apps, which print the name.
//
// Plain JavaScript with a hand-written `hoca-unvan.d.ts`, for the reason
// `youtube-live.js` gives: tedrisat is compiled by `tsc` to CommonJS and
// `require`s this file by path (`@medaris/utils/src/hoca-unvan.js`), so it
// must already be runnable; the web apps import it through `index.ts`. Keep it
// dependency-free.

/**
 * Every unvan code, in the order the course settings list them after the
 * untitled "Hoca", which is no code at all (null). tedrisat's `hoca_unvan`
 * enum holds exactly these values.
 */
export const HOCA_UNVANS = Object.freeze([
  "PROF_DR",
  "DOC_DR",
  "DR",
  "MUDERRIS",
  "MOLLA",
  "MUFTU",
  "SEYH",
  "HAFIZ",
]);

/**
 * What each code puts before the name. Part of the name, so written the same
 * in every locale.
 *
 * @type {Readonly<Record<import("./hoca-unvan").HocaUnvan, string>>}
 */
export const HOCA_UNVAN_PREFIX = Object.freeze({
  PROF_DR: "Prof. Dr.",
  DOC_DR: "Doç. Dr.",
  DR: "Dr.",
  MUDERRIS: "Müderris",
  MOLLA: "Molla",
  MUFTU: "Müftü",
  SEYH: "Şeyh",
  HAFIZ: "Hafız",
});

/** The word after the name of a hoca with no unvan. */
const UNTITLED_SUFFIX = "Hoca";

/**
 * @param {unknown} value
 * @returns {value is import("./hoca-unvan").HocaUnvan}
 */
export const isHocaUnvan = (value) =>
  typeof value === "string" && HOCA_UNVANS.includes(value);

/**
 * A hoca's name as a course shows it: `Prof. Dr. Ahmet Mehmet` with an unvan,
 * `Ahmet Mehmet Hoca` without one.
 *
 * A name that is missing or only spaces gives an empty string, never a bare
 * `Hoca` or `Prof. Dr.`: the caller shows what it shows for a missing name.
 * A code this file does not know (an API newer than the page) counts as no
 * unvan, so the name still reads.
 *
 * @param {string | null | undefined} name
 * @param {string | null | undefined} unvan
 * @returns {string}
 */
export const formatHocaName = (name, unvan) => {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "";
  return isHocaUnvan(unvan)
    ? `${HOCA_UNVAN_PREFIX[unvan]} ${trimmed}`
    : `${trimmed} ${UNTITLED_SUFFIX}`;
};
