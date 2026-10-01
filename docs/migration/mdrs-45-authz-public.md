# MDRS-45 — `@AuthzPublic`: anonymous callers read public decks

## Problem

PRD:76 gives the Guest / Anonim persona "public decks". Two separate things
refused a caller with no token:

1. **Authentication.** `AuthGuard` threw 401 whenever the `Authorization`
   header was absent. It sits at class level on `FlashcardDeckController`.
2. **Authorization.** `AuthzGuard` threw `AuthzMissingUserError` for any
   `@Authz` route with no `request.user`. The matrix had no role for a caller
   without an identity: `PUBLIC` means "any *authenticated* caller".

`FlashcardDeckRepository.findAll()` (public decks only) existed, but no route
could reach it.

## What changed

### `libs/common`

| Piece | Change |
| --- | --- |
| `@AuthzPublic()` (`authz.decorator.ts`) | New method decorator, `AUTHZ_PUBLIC_KEY`. Marks a handler as reachable without a token. |
| `AuthGuard` | Injects `Reflector`. An **absent** header on an `@AuthzPublic` handler passes, with `request.user` unset. A header that is present is verified exactly as before, so empty, non-Bearer, unparseable, badly signed and expired tokens are still 401. |
| `ROLES.ANONYMOUS`, `AnonymousRole` | New role for "no token", kept apart from `PUBLIC`. |
| `RoleResolver.resolveAnonymous?` | Optional. Returns `ANONYMOUS` or `null`. If absent, every anonymous caller is refused (fail-closed). |
| `AuthzService.canAnonymous` | No realm bypass and no `PUBLIC` inheritance. Checks at runtime that the resolver really answered `ANONYMOUS`. |
| `AuthzGuard` | `@AuthzPublic` without `@Authz` → pass. With `@Authz` and no user → `canAnonymous`, refused with **401** (signing in might change the answer). A resolver's 404 still propagates. |
| `AuthzWiringAssertion` | Counts `@AuthzPublic` as a deliberate decision, like `@AuthzExempt`. |
| `MATRIX['flashcard-deck'].ANONYMOUS` | `[VIEW]`. No other entity has an ANONYMOUS row. |

### `apps/tedrisat`

- `TedrisatRoleResolver.resolveAnonymous`, decks only:
  - public deck → `ANONYMOUS`;
  - private or missing deck → `DeckNotFoundError`, the same 404 for both;
  - non-UUID id → `ANONYMOUS`, so `ParseUUIDPipe` answers 400, as it does for everyone.
- `GET /flashcard/decks/:id`: `@AuthzPublic()` alongside its existing `@Authz(VIEW)`.
- `GET /flashcard/decks`: `@AuthzPublic()` replaces `@AuthzExempt()`. An anonymous caller gets `findAll()`, which is public decks only; `?isPublic=false` gives `[]`.
- `GET /` and `GET /health`: `@AuthzPublic()`. No behaviour change, because that controller has no guard. The marker is the explicit exemption MDRS-44's AC-3 asks for.
- `PublicRequest` (`user?`), so a public handler cannot read `request.user.sub` without handling the anonymous case.

## Decisions

**No separate `OptionalAuthGuard`.** The issue suggests one, and suggests
moving the guards off the class onto each method. That would drop the
class-level `@UseGuards(AuthGuard, AuthzGuard)`. A handler added later with
no guard would then be an unauthenticated route, and `AuthzWiringAssertion`
does not inspect unguarded handlers. `AuthGuard` reading the marker keeps
the default closed: only a handler that says `@AuthzPublic()` opens, and the
AC-5 property (an invalid token is 401) lives in one code path.

**`ANONYMOUS` is a role, not a `null` from `resolve`.** The MDRS-40 spike
comment warned against reintroducing the `null ⇒ PUBLIC` fallback. An
anonymous caller has no `sub` to resolve, which is a different case from
"resolved to no role". Keeping a separate role and a separate resolver
method keeps the two senses of the plan's `GUEST` apart.

**Bulk export of a public deck stays authenticated (the open question).**
`GET decks/:deckId/cards/bulk/export` is `@Authz(MANAGE_FLASHCARDS)`, which
is owner-only since MDRS-63, so export is not open even to authenticated
strangers. Opening it to anonymous callers would widen it past what a
signed-in non-owner gets. That also keeps it out of MDRS-31's rate-limiting
question.

## What was verified

- `common:test`: 7 files, 79 tests green. New: `auth-guard.spec.ts` (8), plus new cases in `authz.guard.spec.ts`, `authz.service.spec.ts`, `authz-wiring.assertion.spec.ts` and `auth-matrix.spec.ts`.
- `tedrisat`: `test/e2e/flashcard-deck-public.e2e.spec.ts` (new, 26 tests) runs the **real** `AuthGuard` + `JwtVerifierService` against the run's stubbed signing key. `createTestApp` gets no `authUserId`, because that option stubs the guard into always signing in. It pins:
  - AC-1: anonymous `GET` of a public deck is 200;
  - AC-2: a private deck is 404, with the same code and message as an absent deck;
  - AC-3: the list returns public decks only, and `?isPublic=false` returns `[]`;
  - AC-4: `PUT`/`PATCH`/`DELETE`, deck create and collect are 401, and the owner's read-back shows nothing moved;
  - AC-5: expired, unknown-`kid`, tampered, non-JWT, non-Bearer and empty-Bearer tokens are 401 on both read routes;
  - authenticated behaviour is unchanged: the author reads their private deck, a stranger gets 404 on it and 403 on a write to a public deck;
  - `/health` returns 200 with no token.
- `tedrisat-role-resolver.spec.ts`: `resolveAnonymous` cases for decks, and `null` for köşk, course, madrasah and ijazah.

The full gate results are in the PR.

## What was not verified

- **AC-6 end to end.** "An `@AuthzPublic` endpoint is reachable anonymously after MDRS-44 flips closed-by-default" cannot be exercised before that flip exists. What exists is the branch it rests on: `AuthzGuard` returns early for `@AuthzPublic` *before* the transitional no-metadata pass-through, and `authz.guard.spec.ts` pins that. MDRS-44 should add the end-to-end assertion.
- **A live Keycloak token.** The e2e suite uses the stubbed realm key. `keycloak-audience.e2e.spec.ts` is untouched and is what proves the real realm.
- **No web UI change.** tedris-web still requires sign-in to reach deck pages. An anonymous discovery surface is Phase 7 / MDRS-122.
- **OpenAPI.** The two public operations still list `security: [{ bearer: [] }]`, because the class carries `@ApiBearerAuth()`. The published spec therefore says a token is required where it is now optional. Deliberately not changed here: changing it would regenerate `libs/services/swagger-docs/tedrisat.json` and the typed client for a documentation-only difference.

## Follow-ups (not opened as issues)

- **Card reads on a public deck** (`GET cards?deckId=`, `GET cards/:id`). Anonymous callers can see a public deck but not its cards. Both handlers read `request.user.sub` for per-user progress, so opening them means an anonymous variant of that query. Studying a public deck without an account needs this. It belongs with MDRS-122 or the Phase 7 discovery work, not here.
- **Köşk, medrese, course intro pages and a closed course's sample lesson.** These are in the 29 September "read this first" block. MDRS-122 is blocked by this issue and owns them; it adds an ANONYMOUS row per entity and a branch in `resolveAnonymous`. No second mechanism is needed.
- **Passive scopes answer 404 to anonymous callers.** There is no passive flag on decks, so nothing to do here. It applies to MDRS-122's entities.
- **OpenAPI optional security** on the public operations (see above).
- **`authorId` in the anonymous deck response.** `FlashcardDeckResponse` carries the author's Keycloak `sub`. An authenticated stranger already saw it on a public deck; now a caller with no account sees it as well. The 29 September block's "an anonymous response carries only intro fields" rule is written for courses (MDRS-103). If it should apply to decks too, the fix is an anonymous response shape without `authorId`. Not done here because it changes the published contract and the generated client.
- **Rate limiting.** The global `ThrottlerGuard` (`APP_GUARD` in `libs/common/src/throttler/throttler.module.ts`) runs before the controller guards, so the anonymous routes are throttled per IP like every other route. No anonymous-specific limit was added.
