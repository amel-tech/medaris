# MDRS-182 - Nizam dashboard stack-52 fixes

## Summary

Two corrections to align code, tests and documentation with the design spec (nizam/01, 02, 05, 15):

1. **Köşk aç button visibility**: Only the başnazım (chief) can open a köşk; the button is never shown to a Medaris nazımı, even one with `platform.kosk_create` permission. Fixed the e2e test to verify this.

2. **Reject reason requirements**: Clarified that the rejection reason is **required** for köşk applications (nizam/15) but **optional** for course enrollments (nizam/02).

## Findings

### Finding 1: Köşk aç button

**Problem**: `apps/nizam/e2e/dashboard.e2e.ts:430-447` expected a Medaris nazımı with `platform.kosk_create` permission to see the "Köşk aç" button, but the code enforces that only the başnazım can open a köşk.

**Code evidence**:
- `apps/tedrisat/src/nizam-dashboard/dashboard-sections.ts:28` — `openKosk: chief` (only başnazım)
- `apps/tedrisat/test/unit/nizam-dashboard/dashboard-sections.spec.ts:47-51` — explicit test: "never offers Köşk aç to a nazım"

**Design spec**:
- PLAN.md line 443 (Düzeltme 1): "`can.openKosk` yalnız başnazım" (only chief)

**Fix**: Changed the e2e test to verify that a nazım with `platform.kosk_create` does **not** see the button, confirming the spec decision.

### Finding 2: Reject reason (optional vs. required)

**Code evidence**:
- `apps/tedrisat/src/kosk-application/nizam-kosk-applications.controller.ts:116-117` — "The reason is required" for köşk applications
- `apps/tedrisat/src/course/dto/enrollment-actions.dto.ts` — "nizam/02: optional" for course enrollments
- `RejectReasonDto` in `deck-review.dto.ts:92-101` — `@Matches(/\S/)` enforces non-blank for both

**Design spec**:
- nizam/15 (köşk applications): "Ret gerekçesi*" zorunlu (required, line 26 and AC 2)
- nizam/02 (course enrollments): "gerekçe 'isteğe bağlı'" (optional, line 27)

**Status**: Code matches spec. Documentation now clarifies the distinction.

## Files changed

- `apps/nizam/e2e/dashboard.e2e.ts` — Fixed test expectation and description
- `docs/migration/mdrs-182-nizam-dashboard-fixes.md` — This document

## Verification

Run the gates to confirm:
```bash
pnpm nx run-many -t typecheck --skip-nx-cache
pnpm nx run-many -t test --skip-nx-cache  # e2e test fixed
pnpm nx run-many -t build --skip-nx-cache
pnpm nx run-many -t lint --skip-nx-cache
pnpm nx run-many -t module-boundaries --skip-nx-cache
```
