/**
 * How a celse's homework is handed in (MDRS-248): files uploaded on the celse
 * page, which every homework did before, or recited to the müderris
 * ("Ezberini hocana dinlet"), which uploads nothing and is marked on nazar's
 * "Değerlendirme" instead.
 */
export enum AssignmentKind {
  FILE = "FILE",
  MEMORIZE = "MEMORIZE",
}

/**
 * Where a talebe stands on a memorisation homework, as the course team marked
 * it: "Tam", "Eksik", "Vermedi". A talebe with no mark is "Bekliyor", which is
 * no row rather than a value.
 */
export enum EvaluationStatus {
  FULL = "FULL",
  INCOMPLETE = "INCOMPLETE",
  ABSENT = "ABSENT",
}
