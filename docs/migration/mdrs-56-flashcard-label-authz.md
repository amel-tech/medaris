# MDRS-56 — Assert ownership on the label read routes

Base: `cb7e963` (`chore(repo): MDRS-48 integrate twelve reviewed pull requests
into release/260817`, PR #44).

Every figure below was read off command output on this branch. What could not be
measured is listed under **Not verified** rather than left out.

## The defect

MDRS-27 put both label controllers behind `AuthGuard`, and its follow-up added
`assertOwner` to `DELETE` on each. The **read** routes were left uncovered.

On `cb7e963`, four routes carried the class-level `@UseGuards(AuthGuard)` and no
ownership assertion at all:

| Route | Reached |
| --- | --- |
| `GET /flashcard-label/:id` | `FlashcardLabelRepository.getById` → `select() from flashcardLabels where id = ?` |
| `GET /flashcard-label/getStats/:id` | `FlashcardLabelRepository.getLabelStats` → `select() from flashcardLabelStats where label_id = ?` |
| `GET /flashcard-deck-label/:id` | `FlashcardDeckLabelRepository.getById` → `select() from deckLabels where id = ?` |
| `GET /flashcard-deck-label/getStats/:id` | `FlashcardDeckLabelRepository.getLabelStats` |

No owner predicate on any of them. Any authenticated caller who knew or
brute-forced a UUID read another user's PERSONAL label — its title, its scope,
its usage count. Not destructive like the delete hole that MDRS-27 closed, but
the same class of defect: authenticated is not authorized.

`assertOwner` already existed on both services and was reached only from
`deleteLabel`.

## What changed

Four handlers now take `@Req() request: AuthorizedRequest` and pass
`request.user.sub` down; the four service methods call the **existing**
`assertOwner` before touching the repository. That is the whole mechanism — no
new authorization abstraction was introduced, because that is MDRS-41's
deliverable (port the PR #80 `@Authz` machinery into `libs/common`) and MDRS-43's
to apply. Inventing a second, hand-rolled policy layer here would have to be
unpicked by both.

The two `assertOwner` implementations stay as they were, including their
difference: `FlashcardLabelService` reads `userId`, `FlashcardDeckLabelService`
reads `createdBy`, because `deckLabels` has no `userId` column.

Each read route also gained the `403` and `404` `@ApiResponse` entries that
`DELETE` already declared, so the generated OpenAPI description matches what the
handler does.

Both `getById` methods also guard their second read. `assertOwner` and the read
that follows it are two separate queries, so a delete landing between them makes
the second one miss — and returning that miss unguarded would answer 200 with an
empty body, exactly the shape this change sets out to remove. Losing the race is
a 404 instead. On the deck side the guard is load-bearing for a second reason,
the same one already noted on `assertOwner`: that repository's `getById`
destructures `[result]` and is typed non-null, so a miss arrives as `undefined`
while the type claims otherwise.

### The PUBLIC-scope decision

The issue called this out as the one real design question, and asked for the
answer to be written into the controller comment whichever way it went. It is,
at `apps/tedrisat/src/flashcard/flashcard-label.controller.ts`, with
`flashcard-deck-label.controller.ts` pointing at it rather than restating it.

**Reads are owner-only. `scope` is not consulted, identical to delete.** A
PUBLIC label is readable today only by its author. Reasons, in order of weight:

1. There is nowhere to express "PUBLIC means world-readable" that is not a
   second hand-rolled rule inside a service — see above.
2. No caller is affected. Neither controller has a list route, and

   ```
   git grep -n "flashcard-label\|flashcard-deck-label\|flashcardLabel" \
     -- apps/tedris apps/nizam apps/nazir apps/landing libs
   ```

   returns four lines, all of them the landing page's i18n key
   `mainCard.flashcardLabel` (`apps/landing/sections/features/index.tsx:40` and
   `libs/i18n/src/locales/{ar,en,tr}/landing.json:39`). Neither route path
   appears anywhere in a web app, so nothing today reaches a PUBLIC label by id.
3. Closed is the reversible direction. Opening PUBLIC reads later is an additive
   change to one predicate; discovering PUBLIC disclosed something it should not
   have is not reversible.

This is deliberately the stricter reading of the issue, which suggested PUBLIC
"probably should" be readable by anyone. If that is the product intent it
belongs with the scope/visibility model, not with a UUID lookup — see
**Follow-ups**.

### 403 vs 404 is an existence oracle, and that is accepted

`404` is returned for an id that does not exist, `403` once the row exists but
belongs to somebody else — `assertOwner`'s existing order, unchanged.

**So the status code does tell a caller whether an id names a real label.** An
earlier draft of this file and of the spec comment claimed the opposite; that was
wrong, and it is corrected here rather than quietly dropped, because the next
reviewer would have relied on it. The distinction is deliberate:

- MDRS-56's acceptance criteria ask for these two codes by name.
- `DELETE` has behaved this way since MDRS-27. Hiding existence on reads alone
  would leave the two paths disagreeing about the same rows for no stated reason.
- The discriminator is a v4 UUID behind authentication. `/security-review`
  assessed this specific channel and did not raise it, on the grounds that
  unguessable ids make the oracle impractical to walk.

Uniform `404` remains available if the repository ever decides existence must be
hidden: it is one ordering change inside `assertOwner`, and doing it there covers
reads and delete in the same move. That is the reason not to fork the behaviour
in the read handlers now.

## Verified

Gate on this branch, `--skip-nx-cache` throughout:

| Target | Result |
| --- | --- |
| `typecheck` | 16 projects, green |
| `test` | **238 tests / 17 files**, green (3 projects) |
| `build` | 8 projects, green |
| `lint` | 16 projects, green |
| `module-boundaries` | 16 projects, green |
| `node tools/ci/biome-ratchet.mjs` | 553 files, 0 errors / 91 warnings / 27 infos — all at baseline |

The base was `226 / 17`; the twelve added cases account for the difference, and
the run described under **The pre-fix state** confirms that figure from this
branch rather than taking it on trust. Note `CLAUDE.md` still records "91 tests /
10 suites", which was already stale before this change.

Twelve e2e cases were added to
`apps/tedrisat/test/e2e/flashcard-label.e2e.spec.ts`, in a new
`Label reads — ownership (e2e)` block modelled on the delete block: the row is
seeded as `TEST_USER_ID` through one app, then attacked from a second app
authenticated as `OTHER_USER_ID`, because `createTestApp({ authUserId })` stubs
the guard to impersonate exactly one user.

- four × 403 for another user's row (both controllers, `:id` and `getStats/:id`),
  each also asserting the payload is absent rather than trusting the status alone
- two × 403 for a PUBLIC label, pinning the decision above on both controllers
- four × 404 for an id that does not exist, one per route
- the owner is not locked out of their own label
- the owner is not *denied* their own stats (see below for why that one is
  asserted negatively)

### The pre-fix state, measured

Not asserted from reading the code. The four modified source files were stashed
and the new spec run against unmodified handlers, which is the only way to say
what the routes actually did. Eleven of the thirteen new or tightened cases
failed — ten of the twelve new ones, plus the tightened delete assertion — and
their failures are the evidence:

| Case | Before | After |
| --- | --- | --- |
| `GET /flashcard-label/:id`, attacker | **200**, carrying the owner's row | 403 |
| `GET /flashcard-deck-label/:id`, attacker | **200**, carrying the owner's row | 403 |
| Same two, PUBLIC scope | **200** | 403 |
| Both `:id` routes, id does not exist | 200 with an empty body | 404 |
| Re-read after a successful delete | 200 with an empty body | 404 |
| Both `getStats/:id` routes, attacker | **500** (see follow-up 1) | 403 |
| Both `getStats/:id` routes, id does not exist | **500** | 404 |

So the disclosure was real and direct on the two `getById` routes: a valid token
plus a guessed UUID returned another user's label in full, PUBLIC or PERSONAL.

The `getStats` routes disclosed nothing only because they were already broken —
the 500 is the column-name drift in follow-up 1, not a check. The twelfth case
(`does not deny the owner their own label stats`) passed before and after, which
is the point of asserting it negatively.

That run also fixes the base count independently: 225 passed + 11 failed = 236 in
`tedrisat` with the twelve new cases present, so the pre-existing tedrisat total
is 224 and the workspace total 226.

One existing assertion was tightened rather than left passing for the wrong
reason. `deletes a label the caller owns` re-read the label after deleting it and
asserted `after.body?.id` was undefined — true both when the route answered 200
with an empty body and now that it answers 404. It asserts the 404 explicitly.

### Review

`/security-review` on the diff: **0 findings**. It confirmed all four routes are
now unconditionally authorized, the ownership column is right for each table, no
route outside these two repositories queries those tables, `/getStats/:id` cannot
be shadowed by `/:id`, and the 403/404 ordering is not a usable enumeration
channel behind unguessable v4 UUIDs.

`/code-review high` raised five findings. Four of them — the double-read race on
both services, the deck stats comment describing a null the repository cannot
produce, and the wrong failure denominator — had already been found and fixed by
a second correctness review run in parallel; they are in the table below. The
fifth was new and is the one that mattered:

| `/code-review` finding | Outcome |
| --- | --- |
| The spec comment and this file claimed a caller cannot distinguish "not yours" from "no such row". The code does exactly the opposite. | **Fixed** — both texts rewritten. The oracle is real, is required by the acceptance criteria, matches `DELETE`, and is now argued rather than denied. See the section above. |

It also confirmed, independently: `assertOwner` throws `NotFoundError` before
`ForbiddenError`; the error classes map to 404/403 through `@medaris/common`; no
caller anywhere in `apps/` or `libs/` still uses the old single-argument
signatures; `flashcardLabels.userId` is `notNull`, so no legacy row can be locked
away from its owner by the new gate; the declaration order of `@Get("/:id")` and
`@Get("/getStats/:id")` is safe; and migrations 0008–0011 do not repair the
column drift in follow-up 1.

The parallel correctness review returned six findings, all addressed here:

| Finding | Outcome |
| --- | --- |
| Delete racing the second read answers 200-with-empty-body | Fixed — both `getById` methods guard the second read |
| Deck `getLabelStats` has no empty guard; the comment claimed otherwise | Comment corrected, defect folded into follow-up 1 — not patched, see there for why |
| The spec's block comment overstated the measured not-found result by two cases | Fixed — the two `getStats` routes answered 500, not 200 |
| "Eleven of the twelve" — wrong denominator | Fixed, the population is thirteen |
| The `grep` quoted in this file could not produce the output attributed to it | Fixed — the command actually run is quoted, with its four hits |
| "a legitimate 200-with-null" stated in the present tense of a route that 500s | Fixed — qualified against follow-up 1 |

## Not verified

- **CI.** Nothing in this record comes from a CI run; every figure is local.
- **The `getStats` routes have never returned a successful response, and still
  do not.** Both are broken for *every* caller, owner included, for a reason
  unrelated to authorization — see **Follow-ups**. So while `403` and `404` on
  those two routes are measured, the `200` path is not: it cannot be reached on
  this branch. The owner-side test therefore asserts `not 403` and `not 404`
  rather than `200`, so it goes green on its own the day the underlying defect
  is fixed.
- **The delete-between-the-two-reads race was not reproduced.** The guard added
  to both `getById` methods is reasoned, not measured: racing a delete against a
  read is impractical to stage in this suite. What *is* measured is that the
  guard changes nothing else — the full suite is green with it in place, and the
  only way to reach it is a miss that `assertOwner` has already ruled out.
- **No live Keycloak.** All e2e coverage runs against the stubbed guard
  (`createTestApp({ authUserId })`) or the real guard with no token at all. That
  `request.user.sub` carries the Keycloak subject in production is inherited from
  MDRS-27, not re-verified here.
- **Interaction with PR #55 (MDRS-58) is unmeasured.** That PR is open and
  changes the same four handlers; this branch is cut from `cb7e963` and does not
  contain it. See **Follow-ups**.

## Follow-ups

Recorded here rather than filed — opening Linear issues is the user's call.

1. **`flashcard_label_stats` and `deck_label_stats` are unreachable: the
   migrations and the drizzle schemas disagree about two column names.** This is
   a real, pre-existing 500 on both `getStats` routes for every caller, found
   while writing the owner-side test and measured, not inferred:

   | Table | Migration `0007_equal_amazoness.sql` creates | Schema declares |
   | --- | --- | --- |
   | `flashcard_label_stats` | `"usageCount"` (line 33) | `integer("usage_count")` — `flashcard-label.schema.ts:21` |
   | `deck_label_stats` | `"lable_id"` (line 25, sic) | `uuid("label_id")` — `flashcard-deck-label.schema.ts:39` |

   The observed response body is
   `{"type":"UNKNOWN_ERROR","status":500,"message":"Failed query: select \"id\",
   \"label_id\", \"usage_count\", \"last_used_at\" from
   \"flashcard_label_stats\" where ..."}`. The `deck_label_stats` FK constraint
   at line 59 references `"lable_id"` too, so the typo is load-bearing and the
   fix is a migration, not a schema edit. Nothing exercised these routes before
   this change — the only coverage was MDRS-27's 401 sweep, which never reaches
   the database. Out of scope here: MDRS-56 is authorization, and a schema
   migration has a blast radius of its own.

   **A second defect hides behind the first**, and the two must be fixed
   together. `FlashcardDeckLabelRepository.getLabelStats` reads
   `stats[0].labelId` with no empty guard and is typed
   `Promise<IFlashcardDeckLabelStats>`, so once the column drift is repaired, a
   deck label that has never been applied will throw a `TypeError` — a 500
   where the flashcard-side sibling (`flashcard-label.reporsitory.ts:86`,
   `stats.length > 0 ? stats[0] : null`) correctly returns null. It is the same
   `[result]`-shaped defect that the `assertOwner` comment already calls
   load-bearing. Deliberately not patched here: while the drift stands, a guard
   added today could not be exercised by any test, and shipping an unverifiable
   fix is worse than recording it. Both service comments point at this
   paragraph.

2. **That 500 leaks the SQL statement and its parameters to the caller.** The
   message above is verbatim what the client receives. MDRS-29 ("Stop
   `libs/common` leaking internal exception messages and rejected input") owns
   this; noting it because these two routes are a concrete instance of it. This
   change narrows the exposure incidentally — a non-owner now gets 403 before
   the query runs — but the owner still sees it, and it is not a fix.

3. **Whether PUBLIC labels should be world-readable is still open**, by
   construction. The decision recorded above is the conservative one and is
   pinned by two tests so that reversing it has to be deliberate. It belongs with
   the scope/visibility model, alongside MDRS-41/MDRS-43.

4. **The remaining MDRS-26 gap is untouched.** Whether a caller may *label* a
   card or deck they do not own is still unchecked on `POST /labeling` for both
   controllers. That was already flagged in the MDRS-27 controller comment and is
   not narrowed by this change.

## Conflict note — PR #55 (MDRS-58)

PR #55, branch `argedikas/mdrs-58-regen-tedrisat-spec`, is **open and not
merged** as of this writing. It changes the same four read handlers: unknown ids
answer 404 instead of 200-with-an-empty-body, and the two `getById` service
methods return `Promise<IFlashcardLabel>` without `| null`. This branch is cut
from `cb7e963` and does not contain any of that.

The two changes agree on the outcome for a missing id — both make it a 404 — but
arrive there differently: #55 by an explicit check in the handler, this one via
`assertOwner`. Whichever lands second will conflict in
`flashcard-label.controller.ts`, `flashcard-deck-label.controller.ts`, the two
services and the shared e2e spec. Merge order matters; resolving it should keep
`assertOwner` as the single gate and drop the now-redundant not-found check
rather than running both.

`libs/services/swagger-docs/tedrisat.json` is *not* touched here. The committed
spec contains no label paths at all today (verified: no path key matching
`label`); regenerating it is #55's deliverable.
