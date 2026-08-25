# ADR-002: One API Response Shape — Bare Payloads, No Envelope

**Status:** Proposed
**Date:** 2026-08-25
**Authors:** Argedik
**Issue:** [MDRS-32](https://linear.app/amel-tech/issue/MDRS-32) (parent [MDRS-26](https://linear.app/amel-tech/issue/MDRS-26))

## Context

`libs/common` shipped a `MedarisResponse<T>` envelope — `{ success, message, data, meta }`
with a `MedarisMetaResponse` / `MedarisMetaPaginationResponse` pair hanging off `meta` —
alongside a matching `MedarisResponse.success()` / `.error()` factory.

Measured on `origin/main` at `cb7e9636`, one controller used it:
`apps/tedrisat/src/example/example.controller.ts`, on all four of its routes. Every other
tedrisat and teskilat route returned its DTO bare. The generated client carried both
shapes: `libs/services/src/tedrisat/generated/src/models/MedarisResponse.ts` existed only
because `/examples` referenced it, and `PaginatedKoskResponse` — the one place in the API
that actually paginates — carries its own `items` / `total` / `page` fields rather than
`MedarisMetaPaginationResponse`.

So the envelope was never a convention. It was a scaffolding artefact with exactly one
caller, and that caller is the example module MDRS-32 removes. Something had to be decided
before the removal, because deleting the caller and keeping the type would leave dead
exported API surface in a shared library.

Pagination is worth stating separately, because it is the usual reason an envelope earns
its keep: the API already answers that need without one. `PaginatedKoskResponse` is a
first-class response DTO, generated into the client as such, and typed per endpoint. An
envelope would have moved that information into an untyped `meta` bag.

## Decision

**Endpoints return bare payloads.** A successful response body is the resource, the list of
resources, or a response DTO shaped for the endpoint — never a wrapper carrying the payload
in a `data` field.

Concretely:

1. `MedarisResponse`, `MedarisMetaResponse` and `MedarisMetaPaginationResponse` are deleted
   from `libs/common/src/response/`, and `export * from "./response"` is removed from
   `libs/common/src/index.ts`. `grep -rn 'MedarisResponse' apps/*/src libs/*/src` must return
   nothing.
2. No global response interceptor is introduced in `libs/common`. A future one would
   re-wrap every existing endpoint and invalidate the generated client wholesale.
3. Errors keep the shape `GlobalExceptionFilter` already produces. This ADR is about
   **success** bodies; the error contract is untouched and unrelated.
4. Pagination is expressed as a per-endpoint response DTO — `PaginatedKoskResponse` is the
   precedent — not as envelope metadata. A new paginated endpoint copies that shape.
5. Reversing this decision requires a new ADR that supersedes this one, and its
   implementation is a breaking change to every consumer of `@medaris/services`.

## Alternatives Considered

**Adopt `MedarisResponse` everywhere via a global interceptor in `libs/common`.** This was
the other half of MDRS-32's proposal, and it loses on cost measured against a benefit
nobody had asked for. It would rewrite the response body of every route in both APIs,
regenerate every model in `libs/services/src/tedrisat/generated`, and require every web app
to unwrap `.data` at each call site. The envelope's own fields do not pay for that:
`success` duplicates the HTTP status, `message` duplicates what the error contract already
carries, and `meta` was unused by every endpoint that had real metadata to report.

**Keep the type in `libs/common`, unused, for a later decision.** Rejected: a dead exported
class in a shared library reads as an available convention. The next person to add an
endpoint would have had to guess which of the two shapes the repo actually wanted, which is
the exact state MDRS-32 was filed to end. Git history keeps the code recoverable if the
decision is ever revisited.

**Envelope for collections only, bare for single resources.** Rejected: it makes the shape
depend on cardinality rather than on the endpoint, so a client cannot tell from a type
whether it must unwrap. It also does not solve pagination any better than a typed response
DTO does.

## Consequences

### Positive

- One shape to learn, per endpoint, readable from the generated client's type.
- `libs/common` loses three exported classes with no remaining caller.
- The generated client loses three models and one API class; the `@medaris/services`
  surface now matches the endpoints that exist.

### Negative

- No place to attach cross-cutting response metadata (request id, deprecation notice)
  without touching every endpoint. If that need is ever real, it belongs in headers, or in
  a new ADR that supersedes this one.
- Anyone who had built against `MedarisResponse` has to unwrap. Measured across
  `apps/*/src` and `libs/*/src` at `cb7e9636`: no app and no library did — the example
  controller was the only caller. Unmerged branches were not surveyed.

### Neutral

- Not verified: no deployed environment was queried, so this ADR does not claim what the
  live `/examples` responses looked like. The claim is about the source tree at
  `cb7e9636`.
- The `examples` table itself is not dropped by MDRS-32. See
  [`docs/migration/mdrs-32-example-module-removal.md`](../migration/mdrs-32-example-module-removal.md).

## Related

- [MDRS-32](https://linear.app/amel-tech/issue/MDRS-32) — the removal this ADR unblocks.
- [ADR-001](001-monorepo-merge-and-layout.md) — layout and toolchain; `libs/common` is the
  `scope:server` built library this ADR trims.
- `apps/tedrisat/src/kosk/dto/paginated-kosk-response.dto.ts` — the pagination precedent
  decision 4 points at.
