import { ENTITIES, Entity, ROLES, Role, SCOPES, Scope } from "./scopes";

/**
 * Authorization matrix — `MATRIX[entity][role] = allowed scopes`.
 *
 * Sources:
 *   - Plan §4.1 (course) → {@link MATRIX.course}
 *   - Plan §4.2 (flashcard deck, 5 variants collapsed to one entity;
 *     variant dispatch lives in `RoleResolver.resolveDeckRole`)
 *     → {@link MATRIX['flashcard-deck']}
 *   - Plan §4.3 (kosk) → {@link MATRIX.kosk}
 *   - Plan §4.4 (madrasah) → {@link MATRIX.madrasah}
 *   - Plan §4.5 (lesson-recording / exam / homework / annotation /
 *     discussion-room) — these inherit from their parent course and so
 *     authorize against the COURSE entity, not their own row.
 *   - Plan §4.6 (ijazah) → {@link MATRIX.ijazah}
 *
 * The `PUBLIC` row applies only when `RoleResolver.resolve` returns
 * `ROLES.PUBLIC` explicitly — a `null` result is a hard deny with no
 * `PUBLIC` fallback (see `AuthzService.can`). SYSTEM_ADMIN is
 * not listed in any row: realm-role bypass in `AuthzService.can`
 * short-circuits before the matrix is consulted.
 *
 * Entries missing from this map mean "denied unless SYSTEM_ADMIN" — the
 * matrix is closed by default; only explicitly listed scopes are
 * granted.
 *
 * **Reachability (MDRS-41).** This matrix is a faithful transcription of
 * plan §4 in full, kept complete on purpose rather than trimmed to what
 * `TedrisatRoleResolver` currently wires up — the unwired rows are where
 * the next resolver work (nazır tables, ijazah tables) lands. As of this
 * port, 9 of the 19 rows below were unreachable because no `RoleResolver`
 * implementation could produce that role for that entity yet; MDRS-106 made
 * the two MADRASAH_NAZIR rows on `kosk` and `madrasah` reachable, leaving 7,
 * each marked `// UNREACHABLE` with the reason. MDRS-134 removed the `kosk`
 * one with the köşk affiliation it depended on, leaving 18 rows. An unreachable row denies
 * everyone but SYSTEM_ADMIN today — it grants nothing until its resolver
 * exists, so keeping it here is behaviour-neutral. `MATRIX.ijazah` is the
 * one to read carefully: it has no `PUBLIC` row at all, and
 * `TedrisatRoleResolver` can only ever return `PUBLIC` for `ijazah`, so
 * every ijazah check denies for any non-admin caller until a real
 * resolver lands — latent today because no ijazah controller exists.
 */
export const MATRIX: Record<Entity, Partial<Record<Role, Scope[]>>> = {
  // Plan §4.1 — Course. All five rows are reachable: `resolveCourseRole`
  // returns KOSK_MANAGER, MUDERRIS, ENROLLED, PENDING or PUBLIC.
  //
  // `DELETE` is on no row (MDRS-124): the owner decided on 26 September that
  // nobody who runs a köşk or teaches a course deletes anything — they hide
  // it (`ARCHIVE`), and only SYSTEM_ADMIN deletes, through the realm bypass.
  // Plan §4.1 granted DELETE to KOSK_MANAGER and MUDERRIS; that is withdrawn.
  [ENTITIES.COURSE]: {
    [ROLES.KOSK_MANAGER]: [
      SCOPES.VIEW,
      SCOPES.VIEW_DETAILS,
      SCOPES.EDIT,
      SCOPES.ARCHIVE,
      SCOPES.MANAGE_ENROLLMENTS,
      SCOPES.ASSIGN_MUDERRIS,
      SCOPES.ASSIGN_HOMEWORK,
      SCOPES.GRADE_HOMEWORK,
      SCOPES.SUBMIT_HOMEWORK,
      SCOPES.START_LIVE_LESSON,
      SCOPES.JOIN_LIVE_LESSON,
      SCOPES.CREATE_DISCUSSION,
      SCOPES.MODERATE_DISCUSSION,
      SCOPES.ACCESS_RECORDING,
      SCOPES.SHARE_RECORDING,
      SCOPES.APPROVE_MUTALA,
      SCOPES.GRANT_IJAZAH,
      SCOPES.CREATE_EXAM,
      SCOPES.GRADE_EXAM,
    ],
    [ROLES.MUDERRIS]: [
      SCOPES.VIEW,
      SCOPES.VIEW_DETAILS,
      SCOPES.EDIT,
      SCOPES.MANAGE_ENROLLMENTS,
      SCOPES.ASSIGN_HOMEWORK,
      SCOPES.GRADE_HOMEWORK,
      SCOPES.SUBMIT_HOMEWORK,
      SCOPES.START_LIVE_LESSON,
      SCOPES.JOIN_LIVE_LESSON,
      SCOPES.CREATE_DISCUSSION,
      SCOPES.MODERATE_DISCUSSION,
      SCOPES.ACCESS_RECORDING,
      SCOPES.SHARE_RECORDING,
      SCOPES.APPROVE_MUTALA,
      SCOPES.GRANT_IJAZAH,
      SCOPES.CREATE_EXAM,
      SCOPES.GRADE_EXAM,
    ],
    [ROLES.ENROLLED]: [
      SCOPES.VIEW,
      SCOPES.VIEW_DETAILS,
      SCOPES.SUBMIT_HOMEWORK,
      SCOPES.JOIN_LIVE_LESSON,
      SCOPES.CREATE_DISCUSSION,
      SCOPES.ACCESS_RECORDING,
      SCOPES.REQUEST_MUTALA_CHECK,
    ],
    [ROLES.PENDING]: [SCOPES.VIEW],
    // Anyone authenticated may open a course's page — its description and
    // programme — and request enrollment (MDRS-103, following the owner's
    // 26 September decision recorded on MDRS-43: the course page is public,
    // the lessons are not). `VIEW` is the page; the content (meeting links,
    // agendas, kaynak, resource URLs) is `VIEW_DETAILS`, which starts at
    // ENROLLED. `CourseService.present` strips it for everyone below that
    // line. Pending the matrix discussion; role model v2 (MDRS-135) replaces
    // this row with a permission catalogue.
    [ROLES.PUBLIC]: [SCOPES.VIEW, SCOPES.ENROLL],
    // No token at all (MDRS-122): the course page — the same filtered body a
    // signed-in stranger gets, because `CourseService.present` strips the
    // content for anyone without `VIEW_DETAILS`. Not ENROLL: applying needs an
    // account. `resolveAnonymous` answers 404 for a DRAFT or hidden course and
    // for any course of an unlisted (`is_private`) köşk before this row is read.
    [ROLES.ANONYMOUS]: [SCOPES.VIEW],
  },

  // Plan §4.3 — Kosk
  [ENTITIES.KOSK]: {
    // No MADRASAH_NAZIR row (MDRS-134). MDRS-106 gave a nazır of the köşk's
    // medrese VIEW, EDIT and MANAGE_COURSES here through `kosks.madrasah_id`;
    // role model v2 (MDRS-133) links a medrese to a köşk only by a hosting
    // right, which gives the medrese no power over the köşk.
    // No `DELETE` (MDRS-124): deleting a köşk is SYSTEM_ADMIN's alone.
    // `MANAGE_KOSK_MANAGERS` (MDRS-126) is on this row only — see scopes.ts.
    [ROLES.KOSK_MANAGER]: [
      SCOPES.VIEW,
      SCOPES.EDIT,
      SCOPES.MANAGE_COURSES,
      SCOPES.MANAGE_KOSK_MANAGERS,
    ],
    // Anyone authenticated may view a köşk. `CREATE_KOSK` is
    // intentionally absent from every role except the SYSTEM_ADMIN
    // realm bypass: only platform admins may open new köşks and assign
    // their owner. KOSK_MANAGER status flows from that assignment.
    [ROLES.PUBLIC]: [SCOPES.VIEW],
    // No token (MDRS-122): the köşk's page and its shelf of courses. An
    // unlisted köşk (`is_private`) is opened by link to signed-in callers
    // only; `resolveAnonymous` answers it with the same 404 as a missing one.
    [ROLES.ANONYMOUS]: [SCOPES.VIEW],
  },

  // Plan §4.4 — Madrasah
  [ENTITIES.MADRASAH]: {
    // Reachable since MDRS-106: `resolveMadrasahRole` returns it to a user
    // listed in `madrasah_nazirs`. `DELETE` is deliberately absent — plan
    // §4.4 granted it, the owner withdrew it on 26 September (MDRS-124):
    // only SYSTEM_ADMIN deletes a medrese, through the realm bypass.
    [ROLES.MADRASAH_NAZIR]: [
      SCOPES.VIEW,
      SCOPES.EDIT,
      SCOPES.MANAGE_MADRASAH,
      SCOPES.MANAGE_KOSK,
      SCOPES.MANAGE_DONATIONS,
      SCOPES.DONATE,
      SCOPES.INVITE_NAZIR,
      SCOPES.REMOVE_NAZIR,
      SCOPES.MANAGE_MADRASAH_TAGS,
      SCOPES.MANAGE_MADRASAH_FLASHCARD_DECKS,
      SCOPES.VIEW_MADRASAH_ANALYTICS,
    ],
    [ROLES.PUBLIC]: [SCOPES.VIEW, SCOPES.DONATE],
    // No token (MDRS-122): the medrese's page and the list. Not DONATE —
    // a donation needs a donor.
    [ROLES.ANONYMOUS]: [SCOPES.VIEW],
  },

  // Plan §4.2 — Flashcard deck. The 5 variants from the plan
  // (private/medrese/kosk/course/global) collapse to one entity here;
  // `RoleResolver.resolveDeckRole` decides which role the caller plays
  // for a given deck row based on the deck's subType.
  //
  // PUBLIC covers public/global decks: anyone authenticated can view.
  // Manage on a global deck is SYSTEM_ADMIN-only (realm bypass).
  //
  // UNREACHABLE (MDRS-41): `resolveDeckRole` only ever returns
  // DECK_OWNER or PUBLIC today — it has no medrese/kosk/course variant
  // dispatch yet, so the MADRASAH_NAZIR, KOSK_MANAGER, MUDERRIS and
  // ENROLLED rows below are unreachable until that dispatch is wired.
  // Kept per plan §4.2 for when it lands.
  [ENTITIES.FLASHCARD_DECK]: {
    // Deck owner of a private deck
    [ROLES.DECK_OWNER]: [
      SCOPES.VIEW,
      SCOPES.VIEW_PRIVATE_DECK,
      SCOPES.CREATE_FLASHCARD,
      SCOPES.MANAGE_PRIVATE_DECK,
      SCOPES.MANAGE_FLASHCARDS,
    ],
    // Nazır of the medrese a deck belongs to (subType='medrese')
    [ROLES.MADRASAH_NAZIR]: [
      SCOPES.VIEW,
      SCOPES.CREATE_FLASHCARD,
      SCOPES.MANAGE_FLASHCARDS,
    ],
    // Kosk manager of the kosk a deck belongs to (subType='kosk' or 'course')
    [ROLES.KOSK_MANAGER]: [
      SCOPES.VIEW,
      SCOPES.CREATE_FLASHCARD,
      SCOPES.MANAGE_FLASHCARDS,
    ],
    // Müderris of the course a deck belongs to (subType='course')
    [ROLES.MUDERRIS]: [
      SCOPES.VIEW,
      SCOPES.CREATE_FLASHCARD,
      SCOPES.MANAGE_FLASHCARDS,
    ],
    // Talebe enrolled in the parent course / kosk / medrese
    [ROLES.ENROLLED]: [SCOPES.VIEW, SCOPES.CREATE_FLASHCARD],
    // PUBLIC = anyone authenticated. Covers public/global deck viewing
    // and "any authenticated caller may create a private deck for
    // themselves".
    [ROLES.PUBLIC]: [SCOPES.VIEW, SCOPES.CREATE_PRIVATE_DECK],
    // ANONYMOUS = no token at all (MDRS-45, PRD:76 "public decks" for the
    // Guest persona). Reading a public deck and nothing else: it does not
    // inherit the PUBLIC row, because creating a deck needs an author.
    // `resolveAnonymous` answers 404 for a private deck before this row is
    // read, so VIEW here never reaches one.
    [ROLES.ANONYMOUS]: [SCOPES.VIEW],
  },

  // Plan §4.6 — Ijazah.
  //
  // UNREACHABLE (MDRS-41), all three rows: `TedrisatRoleResolver`
  // returns PUBLIC unconditionally for `ijazah` (no ijazah tables yet),
  // and this row deliberately has no `PUBLIC` entry — so every ijazah
  // check denies for any non-admin caller until a real resolver lands.
  // Latent today because no ijazah controller exists; kept per plan
  // §4.6 rather than pruned, since removing it would just have to be
  // re-transcribed from the plan later with more risk than annotating
  // it now.
  [ENTITIES.IJAZAH]: {
    [ROLES.KOSK_MANAGER]: [SCOPES.VIEW, SCOPES.GRANT_IJAZAH],
    [ROLES.MUDERRIS]: [SCOPES.VIEW, SCOPES.GRANT_IJAZAH],
    [ROLES.ENROLLED]: [SCOPES.VIEW],
  },
};
