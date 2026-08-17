# MDRS-40 — Spike: assess madrasah-backend PR #80, port vs. abandon

**Decision: PORT**, staged in the order already filed, with three scope corrections and one
resequencing. Reasoning and evidence below.

Timebox: this is a spike. No product code is changed by this document. A throwaway compile
probe was run and reverted — see [§7](#7-the-throwaway-port-attempt).

| | |
|---|---|
| Assessed | `amel-tech/madrasah-backend` PR #80, branch `feature/authorization` |
| PR state | open, **draft**, 3,470 additions / 191 deletions, **49 files** |
| Author | `sametcodes` (Samet) |
| Created / last pushed | 2026-06-11 / 2026-06-25 |
| Repo state | `amel-tech/madrasah-backend` is **not yet archived** (`isArchived: false`, last push 2026-06-25) |
| medaris baseline | `origin/main` = `68faa44` |

---

## 1. What was examined

Read in full: the PR body, `AUTHORIZATION.md` (252 lines, added by the PR), all 13
`libs/common/src/authz/` files, `tedrisat-role-resolver.service.ts` (184 lines),
`authz-bindings.module.ts`, the `app.module.ts` / `test-app.helper.ts` /
`libs/common/package.json` / `docker-compose.yml` diffs, `setup-keycloak.sh`, and the
decorator application sites in the four controllers.

Read on the medaris side: `libs/common/src/auth-guard/` (12 files), `libs/common/src/error/`,
`libs/common/src/index.ts`, all 8 tedrisat controllers, `apps/tedrisat/src/database/schema/`,
`apps/tedrisat/.env.example`, `pnpm-workspace.yaml`, Nx target lists for `tedrisat` and
`common`.

Commands whose output backs the numbers in this document are quoted inline. The PR diff was
obtained with `gh pr diff 80 --repo amel-tech/madrasah-backend` (4,911 lines) and the file
list with `gh pr view 80 --repo amel-tech/madrasah-backend --json files`, which returns
`49`.

---

## 2. The finding that changes the estimate: both "missing" documents exist

PRD OQ-9 (`docs/PRD.md:580`) records:

> **Missing referenced docs** — PR #80 cites an "UZUN VADE PLAN" handoff doc not in
> repo/Linear […]

**This is wrong. Both documents are in the Linear workspace, in the *Online Medrese Sistemi*
project.**

| Document | Linear ID | Role in the PR |
|---|---|---|
| `YETKİLENDİRME (AUTHORIZATION) DOKÜMANTASYONU – UZUN VADE PLANI (v1.0)`, 21 Nov 2025 | `06facb16-aef9-4cfb-89ce-ec8cb74828f9` | The "plan" cited as `§3` (scopes) and `§4.1`–`§4.6` (matrices) throughout `scopes.ts` and `auth-matrix.ts` |
| `UZUN VADE YETKİLENDİRME MATRİSİNİN KEYCLOAK UYARLANMASI İÇİN TEKNİK ANALİZ`, 19 Dec 2025 | `994869ca-f201-4cd5-a65f-12dc8dd2f5ba` | The "handoff document" whose `§6` the PR's deviations defer to |

Why the earlier pass concluded otherwise: a Linear `list_documents` search for
`Yetkilendirme Uzun Vade` returns **zero** results, while an unfiltered listing of the
workspace's 22 documents returns both. The titles are upper-case with Turkish diacritics
(`YETKİLENDİRME`, dotted capital İ); the search did not match them. The conclusion "not in
Linear" was a tooling artefact, not a fact.

Two consequences:

1. **The PR is fully reviewable.** `scopes.ts` names its source precisely — the header cites
   `ONLINE MEDRESE SİSTEMİ- AUTHURIZATION - UZUN VADE PLAN.md §3` and `§4` — and that document
   is readable. Every `Plan §4.x` comment in `auth-matrix.ts` can be checked against it.
2. **`AUTHORIZATION.md` §6 already enumerates all three deviations in its own text**, so even
   the handoff doc's `§6` is not load-bearing for review. The PR is self-documenting on the
   points that matter.

PRD OQ-9 should be corrected. That is not done here — `docs/PRD.md` is on this repo's
never-modify list.

### 2.1 Matrix fidelity, spot-checked against the plan

Six rows were checked against plan `§4`:

| Plan | Plan says | `auth-matrix.ts` | Verdict |
|---|---|---|---|
| §4.1 `assign_muderris` for Muderris | ✗ | absent from `MATRIX.course[MUDERRIS]` | faithful |
| §4.1 `edit`/`delete` for Muderris | ✓ | `SCOPES.EDIT`, `SCOPES.DELETE` present | faithful |
| §4.1 `view` for Guest | ✗ | `MATRIX.course[PUBLIC] = [ENROLL]`, no `VIEW` | faithful |
| §4.3 `view` for "Diğer" | ✓ | `MATRIX.kosk[PUBLIC] = [VIEW]` | faithful |
| §4.4 `view` + `donate` for "Diğer" | ✓ | `MATRIX.madrasah[PUBLIC] = [VIEW, DONATE]` | faithful |
| §4.6 `view` for "Diğer" | ✗ | `MATRIX.ijazah` has no `PUBLIC` row | faithful |

The matrix is a careful transcription, not an invention. Plan §5's Keycloak strategy
(resource roles in a user attribute, JS policies, RPT exchange) is deliberately *not*
implemented — that deviation is declared in `AUTHORIZATION.md` §6.1 and PR body §2.1.

---

## 3. Does it still apply? Measured, not estimated

### 3.1 The mechanism half needs no rewriting at all

The 13 files under `libs/common/src/authz/` use **only relative imports**. A grep for
`@madrasah` across them after applying the diff returns nothing. All 18 `@madrasah/common`
occurrences in the PR live in `apps/tedrisat/**` files, the specs, and `AUTHORIZATION.md` —
none in the ported library itself.

Every dependency the mechanism reaches for already exists in medaris at the exact path the PR
uses:

| PR import | medaris path | Present |
|---|---|---|
| `../../error/types` (`ErrorContext`) | `libs/common/src/error/types/error-context.type.ts:1` | yes |
| `../../error/errors/base/forbidden.error` | exists | yes |
| `../../error/errors/base/internal-server.error` | exists | yes |
| `../../error/errors/base/unauthorized.error` | exists | yes |
| `../error/errors/base/medaris.error` (`MedarisError`) | `libs/common/src/error/errors/base/medaris.error.ts` | yes |

Note the last row: the PR already imports `MedarisError`, not `MadrasahError`. The error layer
had been renamed before PR #80 was written, so the guard's `error instanceof MedarisError`
branch needs no change. Constructor arity matches too — `ForbiddenError(code, message,
context)` is exactly what `AuthzForbiddenError` calls.

**Result of the compile probe (details in §7): `libs/common` typechecks green with all 13
authz files in place, after three mechanical changes and zero edits to the ported sources.**

### 3.2 The tedrisat resolver's schema dependencies all exist

`TedrisatRoleResolver` reads five tables and one enum. Every one is present in medaris:

| Needed | medaris location |
|---|---|
| `decks` (`.id`, `.authorId`, `.isPublic`) | `apps/tedrisat/src/database/schema/flashcard-deck.schema.ts:13-21` |
| `kosks` (`.id`, `.ownerId`) | `apps/tedrisat/src/database/schema/kosk.schema.ts:15,17` |
| `courses` (`.id`, `.koskId`) | `apps/tedrisat/src/database/schema/course.schema.ts:26,28` |
| `courseMuderris` (`.courseId`, `.userId`) | `apps/tedrisat/src/database/schema/course.schema.ts:81` |
| `enrollments` (`.courseId`, `.userId`, `.status`) | `apps/tedrisat/src/database/schema/course.schema.ts:106` |
| `EnrollmentStatus` (`PENDING`/`ENROLLED`/`COMPLETED`) | `apps/tedrisat/src/course/domain/enrollment-status.enum.ts` — all three values match |

### 3.3 Dependency management is two catalog lines

`libs/common/package.json` currently has neither `@nestjs/core` nor `@types/express`, so the
PR's addition is genuinely required. Both are **already in the pnpm catalog**
(`pnpm-workspace.yaml:114` `'@nestjs/core': ~11.1.19`; `pnpm-workspace.yaml:140`
`'@types/express': ^5.0.0`), so MDRS-8's "no inline versions" rule is satisfied by writing
`catalog:` twice. The PR's `package-lock.json` change (+14/−24) is discarded outright.

### 3.4 Test runner: no Vitest rework needed today

MDRS-20 has **not** landed. `apps/tedrisat/jest.config.json` exists, a repo-wide search for
`vitest.config.*` returns nothing, and `pnpm-workspace.yaml:107-110` still catalogues `jest`,
`@types/jest`, `ts-jest` and `jest-junit`. `pnpm nx show project tedrisat` lists a real `test`
target. So the PR's five ts-jest specs port **as-is**; they become MDRS-20's problem, not
MDRS-41's. This removes a cost the epic assumed.

One real gap remains: `pnpm nx show project common` lists
`module-boundaries, build, typecheck, depcheck, lint, build:watch, clean, prepublishOnly,
audit, audit:ci` — **no `test` target**. The authz specs therefore have to live under
`apps/tedrisat/test/unit/authz/` as the PR already places them, or `libs/common` needs a test
target added. (MDRS-41's description says `libs/common/project.json` "declares only `lint`";
that is imprecise — but its substantive point, no test target, is correct.)

### 3.5 The `AuthGuard` prerequisite is real, and it is narrower than assumed

`libs/common/src/auth-guard/services/jwt-verifier.service.ts:29` is the only call into
`jsonwebtoken.verify`:

```ts
jwt.verify(token, key, { algorithms: ["RS256"] }, (err, decoded) => {
```

Against `AUTHORIZATION.md` §3's claimed lifecycle ("AuthGuard: validates JWT (signature, iss,
aud, exp)"):

| Claim | medaris reality | Note |
|---|---|---|
| signature | validated | RS256 against JWKS |
| `exp` | **validated** | `jsonwebtoken` checks `exp` by default; no `ignoreExpiration` is set |
| `iss` | not validated | no `issuer` option |
| `aud` | not validated | no `audience` option |
| `typ` | not validated | no check anywhere |

So the epic's phrasing "**ours validates the signature only**" understates us by one claim —
`exp` is covered. The prerequisite still stands, but for a specific reason: PR #80's Keycloak
design puts an **audience mapper** on both SPA clients and states "the backend rejects tokens
whose audience does not match" (`AUTHORIZATION.md` §2). Without `aud` verification that mapper
is decoration. **MDRS-30 is a true prerequisite of MDRS-42, on the audience claim
specifically** — not of MDRS-41, which does not read any claim beyond `sub` and
`realm_access.roles`.

`apps/tedrisat/src/config/config.ts:45-47` confirms there is no issuer or audience config to
build on; MDRS-30 must introduce it.

Also verified as a **non**-blocker: no `@Public()` / `IS_PUBLIC` / `Reflector` bypass exists
anywhere in `libs/common/src` or `apps/tedrisat/src`, so `AuthzGuard`'s `Reflector` usage
introduces the first metadata-driven guard in the repo rather than colliding with one.

### 3.6 Keycloak naming already matches medaris

`apps/tedrisat/.env.example` already ships:

```
KEYCLOAK_JWKS_URL=https://auth.medaris.app/realms/amel-tech-dev/protocol/openid-connect/certs
KEYCLOAK_CLIENT_ID="tedris-dev"
```

`setup-keycloak.sh` creates realm `amel-tech-dev` and SPA client `tedris-dev`. The PR's
Keycloak naming *is* the live medaris naming. MDRS-42 is de-risked accordingly.

One portability wrinkle, and it resolves in our favour: the PR's `docker-compose.yml` mounts
the login theme JAR from `../madrasah-frontend/apps/keycloak-theme/dist_keycloak/...`, a
sibling-repo path. medaris has `apps/keycloak-theme` **in-repo** (confirmed: `apps/` contains
`keycloak-theme, landing, nazir, nizam, tedris, tedrisat, teskilat`, plus
`.github/workflows/keycloak-theme-app.yaml`). The history merge dissolved the sibling
dependency; this is a one-line path edit.

---

## 4. What conflicts — all four collisions are small

The epic named four collision points. Measured against the actual diff:

| File | Filed as colliding with | Actual PR change | Severity |
|---|---|---|---|
| `apps/tedrisat/src/app.module.ts` | MDRS-32 | +2 import symbols, +2 `imports:` entries (`AuthzModule`, `AuthzBindingsModule`) | trivial — MDRS-32 *removes* `ExampleModule`; disjoint lines |
| `apps/tedrisat/src/flashcard/flashcard.controller.ts` | MDRS-37 | 9 added `@Authz(...)` decorator lines + import block; **no body/DTO/pipe change** | low — MDRS-37 changes bulk-create *validation*; disjoint concerns |
| `apps/tedrisat/test/helpers/test-app.helper.ts` | MDRS-20 | +19/−4, adds an `asSystemAdmin` option | low today (MDRS-20 has not landed); see §5.2 — this hunk needs *rejecting*, not merging |
| `libs/common/package.json` | MDRS-21 | +1 peer dep, +2 dev deps | trivial — becomes two `catalog:` lines |

None of these is a reason to abandon. **The mechanism-only slice (MDRS-41) touches exactly one
shared line outside its own new directory: `libs/common/src/index.ts` gains
`export * from "./authz";`.** That is what makes the staged split viable.

Additional overlap worth recording: the PR puts
`@Authz(SCOPES.CREATE_FLASHCARD, byParam(ENTITIES.FLASHCARD_DECK, 'deckId'))` on
`POST decks/:deckId/cards/bulk`, which is precisely the held MDRS-26 issue "Gate flashcard
bulk import/export on deck ownership". The held Phase 0 issues and this PR do fix the same
defects, as the epic states.

---

## 5. What is wrong with the PR — the honest cost side

These are the reasons the port must be staged and reviewed rather than merged wholesale.

### 5.1 Nine of nineteen matrix rows are unreachable

`MATRIX` declares 19 `(entity, role)` rows. `TedrisatRoleResolver.resolve` can never return
the role for 9 of them:

| Entity | Rows | Reachable | Unreachable |
|---|---|---|---|
| `course` | 5 | `KOSK_MANAGER`, `MUDERRIS`, `ENROLLED`, `PENDING`, `PUBLIC` | — |
| `kosk` | 3 | `KOSK_MANAGER`, `PUBLIC` | `MADRASAH_NAZIR` |
| `madrasah` | 2 | `PUBLIC` | `MADRASAH_NAZIR` |
| `flashcard-deck` | 6 | `DECK_OWNER`, `PUBLIC` | `MADRASAH_NAZIR`, `KOSK_MANAGER`, `MUDERRIS`, `ENROLLED` |
| `ijazah` | 3 | — | `KOSK_MANAGER`, `MUDERRIS`, `ENROLLED` |
| **Total** | **19** | **10** | **9** |

Traced from the resolver: `resolveDeckRole` returns only `PUBLIC | DECK_OWNER | null`;
`resolveKoskRole` returns only `PUBLIC | KOSK_MANAGER`; `MADRASAH` and `IJAZAH` short-circuit
to `ROLES.PUBLIC` unconditionally.

The `ijazah` case deserves separate mention: `resolve` returns `PUBLIC` for it, but
`MATRIX.ijazah` has **no `PUBLIC` row**, so *every* ijazah check denies for any non-admin
caller. This is latent, not live — the PR adds no ijazah controller — but it is a trap for
whoever writes one.

This is aspirational configuration that reads as enforcement. It is not a defect in the
*design* (§5.2 of the epic is right that the hierarchy is deferred, see below) but the rows
must be either removed or explicitly marked, or a future reader will believe
`MADRASAH_NAZIR` is enforced.

### 5.2 The test helper makes every stubbed user a SYSTEM_ADMIN

The `test-app.helper.ts` hunk adds:

```ts
const asAdmin = options.asSystemAdmin ?? true;
…
realm_access: { roles: asAdmin ? ['SYSTEM_ADMIN'] : [] },
```

`AuthzService.can` short-circuits on `SYSTEM_ADMIN` before the matrix is consulted. **Defaulting
to `true` means every pre-existing e2e spec runs with the matrix bypassed.** The PR's own
comment says the default exists so fixture setup does not have to mock the authz layer — an
understandable convenience, but it means the "151/151 tests ✅" claim in the PR body does not
demonstrate matrix enforcement on the e2e paths. This hunk must be inverted (default `false`,
opt *in* to admin) at the point `@Authz` is applied, or MDRS-43 will land green and prove
nothing.

### 5.3 Three documentation sites contradict the code on the central semantic

The PR's most important safety property is "resolver returns `null` ⇒ hard deny, no `PUBLIC`
fallback". `AuthzService.can` implements exactly that (`if (!role) return false;`), and PR body
§3 states it correctly. But three doc comments say the opposite:

1. `AUTHORIZATION.md` §3 request lifecycle: `c. role ?? PUBLIC`
2. `role-resolver.interface.ts`: "Returning `null` means 'no specific role applies';
   `AuthzService.can` then falls back to the `PUBLIC` row of the matrix."
3. `scopes.ts`, on `ROLES.PUBLIC`: "Used by `AuthzService.can` as the fallback when
   `RoleResolver` returns null"

The code is the newer intent; the comments are stale from an earlier revision. Left as-is, the
next person "fixes" the code to match the comments and silently opens every private resource.
MDRS-41 already warns "Do not 'simplify' that into a default" — it should also **delete the
three comments that invite the simplification.**

### 5.4 Permissive fall-through

`AuthzGuard.canActivate` returns `true` when a route has no `@Authz` metadata. The PR names
this as its own most important systemic risk. It is the reason MDRS-44 exists and must be
last.

### 5.5 The hierarchy question — verified across the whole matrix, not just one resolver

The spike asked whether the deferral of the unresolved medrese/köşk hierarchy (PRD OQ-10)
holds matrix-wide. **It does.** Checked at every site:

- `MATRIX.course` has **no** `MADRASAH_NAZIR` row at all — correct per plan §1, which states
  the nazır has no direct authority over a ders.
- `MADRASAH_NAZIR` appears in `kosk`, `madrasah` and `flashcard-deck` rows, and the resolver
  returns it **nowhere** (§5.1).
- `resolveKoskRole`: "MADRASAH_NAZIR path is deferred until kosk→madrasah FK lands."
- `resolveCourseRole`: "The MADRASAH_NAZIR path lands once the kosk→madrasah FK exists."
- `resolve` for `MADRASAH`/`IJAZAH`: "TODO(authz): wire nazır / ijazah tables as they land."

The plan document itself carries the ambiguity in its §1 heading ("Medrese Köşk hiyerarşisi
karışmış durumda düzeltilecek"), and the PR declines to encode it. **Porting this does not
commit us to the confused hierarchy** — the epic's claim is confirmed. The cost of the
deferral is the 9 dead rows, not a wrong design.

---

## 6. Decision

**PORT.** Staged as already filed, with corrections.

The determining evidence, in order of weight:

1. **The mechanism compiles into medaris unmodified.** 13 files, 750 added lines, zero source
   edits, green typecheck (§3.1, §7). This is the opposite of what a 7-week-cold cross-repo
   port usually costs, and it is measured rather than estimated.
2. **Both design documents are recoverable** (§2), so the 3,470 lines are reviewable against
   their source of truth. The single largest argument for abandoning — "a 3,470-line pickup
   with a missing design doc" — rests on a premise that is false.
3. **The mechanism-only slice touches one shared line.** MDRS-41 can land behaviour-neutral,
   which is what makes inherited code of this size reviewable at all.
4. **Every schema dependency, catalog entry, error base class and Keycloak name already lines
   up** (§3.2, §3.3, §3.6). There is no missing substrate.
5. **It closes a gap our own discovery missed** — §8 #2, `PATCH`/`PUT` flipping `isPublic` to
   publish another user's private deck. Seventeen issues of discovery did not find it.
6. **The matrix is a faithful transcription of a normative document** (§2.1) that
   `docs/PRD.md:364` already declares binding. Rewriting it from scratch would reproduce the
   same table with more risk of transcription error.

The defects in §5 are real but are all *reviewable and local*: three stale comments, one
inverted test default, nine rows to prune or annotate, one fall-through that already has its
own issue. None of them is structural.

### Corrections to the filed sub-issues

The mechanism / Keycloak / apply / flip-default split **survives contact with the diff** — the
diff partitions along exactly those lines. Four changes:

| # | Issue | Change |
|---|---|---|
| 1 | **MDRS-41** (5 pts, unchanged) | Add to scope: delete the three stale `null ⇒ PUBLIC` comments (§5.3); decide prune-or-annotate for the 9 unreachable rows (§5.1). Drop from scope: Vitest porting — MDRS-20 has not landed, the ts-jest specs port as-is (§3.4). |
| 2 | **MDRS-42** (3 pts, unchanged) | **Title is wrong: the PR contains three Keycloak clients, not four** — `tedrisat-api` (confidential) plus SPA clients `tedris-dev:4000` and `nizam-dev:4001`, per `setup-keycloak.sh`'s `SPA_CLIENTS` array. medaris has five web apps, so a fourth/fifth client may be *wanted*, but it does not come "from PR #80". MDRS-30 confirmed a hard prerequisite, on the `aud` claim specifically (§3.5). |
| 3 | **MDRS-43** (5 pts, unchanged) | Add to scope: invert the `asSystemAdmin` default in `test-app.helper.ts` (§5.2). Without it this issue lands green while proving nothing. |
| 4 | **MDRS-44** (3 → **5 pts**) | 17 routes are currently unguarded — `app.controller.ts` (3 of 4), all 4 of `example.controller.ts`, all 5 of `flashcard-label.controller.ts`, all 5 of `flashcard-deck-label.controller.ts`. Each needs an explicit anonymous-or-authenticated decision before deny-by-default can flip. |

**Resequencing: MDRS-45 (`@AuthzPublic`) moves from follow-up to prerequisite of MDRS-44.**
`GET /health` and `GET /` are legitimately anonymous; there is no way to express that under
deny-by-default until `@AuthzPublic` exists. Revised order:

```
MDRS-41 (5) → MDRS-42 (3) → MDRS-43 (5) → MDRS-45 (3) → MDRS-44 (5)
```

Issues 2–5 as filed totalled 16 points; the revised critical path is **21 points** including
the promoted MDRS-45. MDRS-46 (resolver cache) and MDRS-47 (deck variants) remain independent
follow-ups and are not on the critical path.

### What would be lost by abandoning

Recorded so the decision is made with eyes open, per the spike's brief:

1. The mechanism — 13 files / 750 lines in `libs/common/src/authz/` plus
   `tedrisat-role-resolver.service.ts` (184) and `authz-bindings.module.ts` (26): a typed,
   closed-by-default matrix with a deliberate hard-deny semantic and three distinct guard
   failure codes.
2. Five unit specs, 740 lines (`auth-matrix` 94, `authz.guard` 177, `authz.service` 170,
   `resolvers` 71, `tedrisat-role-resolver` 228), encoding the matrix invariants.
3. The four §8 security fixes. **§8 #2 — `PATCH`/`PUT` flipping `isPublic` — is in no medaris
   issue at all** and must be filed regardless of this decision.
4. `FlashcardService.replaceManyProgress`'s multi-resource visibility check and the
   `FlashcardRepository.findVisibilityByIds` it relies on (§8 #4) — the batch case a
   single-resource decorator cannot express.
5. The `findAllByUser` `(isPublic OR authorId)` defence-in-depth filter (§8 #1).
6. `setup-keycloak.sh`, 262 lines: idempotent realm / realm-role / confidential-client /
   SPA-client / audience-mapper / test-user bootstrap, already using medaris' live realm and
   client names.
7. `scripts/e2e-smoke.sh`, 434 lines.
8. The köşk-creation hardening: `CREATE_KOSK` absent from every matrix row (SYSTEM_ADMIN
   bypass only) plus `CreateKoskDto.ownerId`.
9. `AUTHORIZATION.md` itself, 252 lines — the only written record of the three deviations from
   the plan, and the artefact that made this spike cheap.

---

## 7. The throwaway port attempt

AC asks for a pushed throwaway branch or an explanation of its absence. **A compile probe was
run and deliberately reverted rather than pushed.** What was done, so nobody repeats it:

```
git apply --include='libs/common/src/authz/**' /tmp/pr80.diff   # 13 files, clean apply
# + libs/common/src/index.ts : export * from "./authz";
# + libs/common/package.json : @nestjs/core (peer+dev), @types/express (dev), both `catalog:`
pnpm install
pnpm nx run common:typecheck --skip-nx-cache
```

Output:

```
> nx run common:typecheck
$ tsc --noEmit
NX   Successfully ran target typecheck for project common
```

**Green on the first attempt.** Three mechanical changes, zero edits to any of the 13 ported
files. Elapsed machine time from `git apply` to green typecheck was under two minutes.

The probe was then reverted (`rm -rf libs/common/src/authz`, `git checkout -f HEAD --
libs/common/src/index.ts libs/common/package.json pnpm-lock.yaml`) and the working tree
confirmed clean, because:

- this is a spike whose deliverable is a decision, and
- MDRS-41 is already filed to do this properly, as reviewable product code, with the §5.1/§5.3
  corrections applied — a pushed half-port would compete with it rather than help it.

The reproduction recipe above is the durable artefact; it is four commands and it is the whole
finding.

---

## 8. Verified

Every claim above traces to one of these:

| Verified | How |
|---|---|
| PR #80: 49 files, 3,470/+191/−, open, draft, author `sametcodes`, pushed 2026-06-25 | `gh pr view 80 --repo amel-tech/madrasah-backend --json ...` |
| `madrasah-backend` not yet archived | `gh repo view amel-tech/madrasah-backend --json isArchived` → `false` |
| Both design docs exist in Linear | `list_documents` unfiltered over the workspace; both fetched and read |
| Matrix fidelity, 6 rows | plan §4 text vs. `auth-matrix.ts` |
| 9 of 19 matrix rows unreachable | manual trace of `TedrisatRoleResolver.resolve` against `MATRIX` |
| `libs/common/src/authz/` typechecks in medaris unmodified | `pnpm nx run common:typecheck --skip-nx-cache` → `Successfully ran target typecheck for project common` |
| All 5 resolver tables + 3 enum values exist | `apps/tedrisat/src/database/schema/*.ts`, `enrollment-status.enum.ts` |
| Error base classes + `ErrorContext` exist, arity matches | `libs/common/src/error/**` read directly |
| `@nestjs/core` and `@types/express` in the catalog | `pnpm-workspace.yaml:114`, `:140` |
| medaris validates signature + `exp`, not `iss`/`aud`/`typ` | `jwt-verifier.service.ts:29`, sole `jwt.verify` call site |
| No issuer/audience config exists | `apps/tedrisat/src/config/config.ts:45-47` |
| No `@Public`/`Reflector` bypass exists | grep over `libs/common/src` + `apps/tedrisat/src` |
| `tedrisat` has a `test` target; `common` does not | `pnpm nx show project tedrisat` / `... common` |
| Repo is on Jest, not Vitest | `apps/tedrisat/jest.config.json` present, no vitest config |
| 17 unguarded tedrisat routes | all 8 controllers read; `@UseGuards` sites enumerated |
| `apps/keycloak-theme` exists in medaris | `ls apps/` |
| Realm `amel-tech-dev` / client `tedris-dev` already live | `apps/tedrisat/.env.example` |
| 3 Keycloak clients in the PR, not 4 | `setup-keycloak.sh`: `API_CLIENT_ID` + `SPA_CLIENTS=("tedris-dev:4000" "nizam-dev:4001")` |
| Collision hunks are small | per-file diff hunks read individually |

## 9. Not verified

Stated plainly rather than omitted.

- **Author availability (spike question 5).** `sametcodes` (Samet) authored the PR; whether he
  is available to finish it is a staffing question this spike cannot answer from code or
  Linear. **The estimates in §6 assume a pickup by someone else** — they do not assume the
  original author resumes. If he is available, MDRS-41 and MDRS-43 should be re-estimated
  downward. This needs the epic assignee to answer.
- **The PR's test suite was never executed.** The "~100 tests" (PRD) and "151/151 test ✅" (PR
  body §5) claims are **not** verified here. Only spec file counts and line counts were
  measured. `pnpm nx run-many -t test` was not run against a ported tree.
- **The tedrisat half was not compiled.** `tedrisat-role-resolver.service.ts` and
  `authz-bindings.module.ts` were verified by inspection — every table, column and enum value
  they reference exists — but no typecheck was run on them. §3.1's green result covers
  `libs/common` only.
- **`setup-keycloak.sh` was not executed.** No Keycloak container was started. Its correctness
  is assessed by reading only.
- **The four §8 fixes were reviewed by reading, not by exploiting.** Whether they actually
  close the gaps at runtime is untested here.
- **`e2e-smoke.sh` (434 lines) was read only for sibling-repo path references**, not reviewed
  line by line.
- **Keycloak client requirements for `nazir` and `landing`** are unknown; they are outside PR
  #80's scope. Whether MDRS-42 should create clients for them is a product/infra call.
- **PRD OQ-9's correction was not applied.** `docs/PRD.md` is on this repo's never-modify list;
  the correction needs a separate decision by a doc owner.
