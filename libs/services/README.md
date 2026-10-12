# @medaris/services

Shared service layer for Madrasah applications with auto-generated API clients from OpenAPI specifications.

## Overview

This package provides TypeScript API clients generated from OpenAPI/Swagger specifications for various Madrasah backend services. The clients are automatically generated during build time to ensure they stay in sync with the backend APIs.

## Structure

```
libs/services/
├── swagger-docs/           # OpenAPI specifications
│   ├── tedrisat.json      # Tedrisat service API spec
│   └── README.md          # Documentation for swagger specs
├── src/
│   ├── tedrisat/          # Tedrisat service client
│   │   ├── generated/     # Auto-generated API client (do not edit)
│   │   ├── api-factory.ts # Factory for creating authenticated clients
│   │   └── index.ts       # Public exports
│   ├── file-proxy/        # File uploads/downloads   -> @medaris/services/file-proxy
│   └── utils/             # Error helpers            -> @medaris/services/utils
├── test/                  # Vitest specs (file-proxy)
└── openapitools.json      # OpenAPI generator configuration
```

## Usage

### Basic API Client Usage

```typescript
import { createTedrisatAPIs, DeckInclude } from '@medaris/services/tedrisat'

// Create API clients
const { decks, cards, service } = createTedrisatAPIs({
  baseUrl: 'https://tedrisat-api.madrasah.com',
  token: 'your-auth-token'
})

// Use the generated API methods
const deckList = await decks.getAllFlashcardDecks({ 
  include: [DeckInclude.Tags] 
})

const deck = await decks.getFlashcardDeckById({ 
  id: 123, 
  include: [DeckInclude.Flashcards] 
})
```

### Server-Side Usage (Next.js)

```typescript
import { createServerTedrisatAPIs } from '@medaris/services/tedrisat'
import { getAccessToken } from '~/lib/auth'

// In server components, route handlers and server actions
const token = await getAccessToken()
const { decks } = await createServerTedrisatAPIs(token, env.TEDRISAT_API_BASE_URL)

const decks = await decks.getAllFlashcardDecks()
```

`getAccessToken()` reads the Keycloak access token out of the session cookie,
once per request, and never refreshes it: the app's `proxy.ts` does that.
Each app builds it with `createAuth` from `@medaris/auth` (see
`libs/auth/README.md`).

### Client-Side Usage (React)

The client-side session (`useSession()` from `@medaris/auth/client`, and
`GET /api/auth/session`) carries no token: any script on the page can read it.
Client components therefore cannot call tedrisat
directly with the user's token. Go through a server action (see
`~/lib/authenticated-action.ts` in each app) or a route handler under
`app/api/**`, both of which read the token server-side with `getAccessToken()`.

`createTedrisatAPIs` remains available for callers that hold a token some other
way (for example a service-to-service call with its own credential):

```typescript
import { createTedrisatAPIs } from '@medaris/services/tedrisat'

const { decks } = createTedrisatAPIs({
  baseUrl, // from the server — the web apps declare no NEXT_PUBLIC_* key (MDRS-86)
  token,
})
```

### File uploads and downloads (`@medaris/services/file-proxy`)

The generated client reads every answer as JSON, and the browser holds no
token, so a file goes through the app's own route handler, which hands it to
`proxyUpload` or `proxyDownload` (MDRS-287, MDRS-290). Both are server-only.
Every app wires them the same way:

- `proxyUpload(request, { apiBaseUrl, path, accessToken, maxBytes })` checks
  that the body is `multipart/form-data` with a boundary (else 415
  `MULTIPART_REQUIRED`) and that its `Content-Length` is at most `maxBytes`
  plus a 64 KiB multipart allowance (else 413 `FILE_TOO_LARGE`), then sends
  the request's own stream to tedrisat, unread, with the bearer token and the
  original `Content-Type`. tedrisat's status and JSON body come back as they
  are.
- `proxyDownload({ apiBaseUrl, path, accessToken, signal })` streams the file
  back with the headers tedrisat set for it (`Content-Type`, `Content-Length`,
  `Content-Disposition`, `X-Content-Type-Options`, `Cache-Control`,
  `Content-Security-Policy`) and no other. A refusal (403, 404, 503 …) comes
  back as tedrisat's JSON.
- No token (`await getAccessToken()` gave nothing) answers 401
  `{ kind: "unauthenticated" }`; a token tedrisat refused answers 401
  `{ kind: "unauthenticated", reauth: true }`. Never a redirect: an API route
  answers the page's `fetch`, and the page hands that body to
  `handleUnauthenticated` from `@medaris/auth/client`.
- Only a path under `/courses/` or `/lessons/` made of plain segments
  (letters, digits, `-`, `_`) is sent; anything else answers 400
  `INVALID_PATH`. Check the route params with `isUuid` first and answer 404
  yourself.

```typescript
// app/api/files/courses/[courseId]/resources/[resourceId]/route.ts
import { isUuid, proxyDownload } from '@medaris/services/file-proxy'
import { env } from '~/env'
import { getAccessToken } from '~/lib/auth'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseId: string; resourceId: string }> }
) {
  const { courseId, resourceId } = await params
  if (!isUuid(courseId) || !isUuid(resourceId)) {
    return Response.json({ code: 'NOT_FOUND' }, { status: 404 })
  }
  return proxyDownload({
    apiBaseUrl: env.TEDRISAT_API_BASE_URL,
    path: `/courses/${courseId}/resources/${resourceId}/file`,
    accessToken: await getAccessToken(),
    signal: request.signal,
  })
}
```

```typescript
// app/api/files/courses/[courseId]/resources/route.ts
import { isUuid, MAX_FILE_BYTES, proxyUpload } from '@medaris/services/file-proxy'
import { env } from '~/env'
import { getAccessToken } from '~/lib/auth'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params
  if (!isUuid(courseId)) {
    return Response.json({ code: 'NOT_FOUND' }, { status: 404 })
  }
  return proxyUpload(request, {
    apiBaseUrl: env.TEDRISAT_API_BASE_URL,
    path: `/courses/${courseId}/resources/files`,
    accessToken: await getAccessToken(),
    maxBytes: MAX_FILE_BYTES,
  })
}
```

In the page, a download is a plain link (`<a href="/api/files/…">`), and an
upload a `fetch` with a `FormData` body whose file field is `file`; on 401,
pass the JSON to `handleUnauthenticated(body, { locale })`.

**`proxy.ts` and upload size.** Next.js reads the whole body of every request
its `proxy.ts` matches before the route handler runs, and cuts it off at
`experimental.proxyClientMaxBodySize`, 10 MB by default (read in
`next/dist/server/body-streams.js` and `next-server.js` of Next 16.3; not
measured against a running app). An upload route the app's proxy matches
therefore loses everything past 10 MB unless one of these is done:

- raise `experimental.proxyClientMaxBodySize` in `next.config.js` above
  `MAX_FILE_BYTES` plus the allowance (e.g. `'26mb'`). Next then holds each
  upload in memory once before the handler streams it on; the proxy still
  renews the session; or
- leave the upload route out of the proxy's `matcher`. The body then streams
  end to end, but the proxy does not renew the session on that request, so an
  expired access token answers 401 until the page has made a request the proxy
  sees (for example `GET /api/auth/session`).

Downloads (`GET`) carry no body and are not affected.

## Development

### Generate API Clients

```bash
# Generate all API clients
npm run generate

# Generate specific service
npm run generate:tedrisat

# Build (automatically runs generation first)
npm run build
```

### Adding New Services

1. **Add OpenAPI specification**: Place the swagger JSON file in `swagger-docs/`
2. **Add generation script**: Update `package.json` scripts
3. **Create API factory**: Create factory function for the new service
4. **Add package export**: Update main `package.json` exports

### Available Services

- **Tedrisat** (`@medaris/services/tedrisat`) - Education management service

## Scripts

- `npm run generate` - Generate all API clients from swagger specs
- `npm run generate:tedrisat` - Generate Tedrisat API client only
- `npm run build` - Build the package (runs generation first)
- `npm run clean` - Clean build artifacts and generated files
- `npm run typecheck` - Run TypeScript type checking
- `npm run test` - Run the Vitest specs (`pnpm nx run services:test`)
- `npm run lint` - Run ESLint

## Notes

- **Generated files**: Never manually edit files in `src/*/generated/` directories
- **Regeneration**: API clients are automatically regenerated during build
- **Swagger specs**: Keep swagger-docs files up to date with backend APIs