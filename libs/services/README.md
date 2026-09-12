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
│   └── core/              # Core utilities and shared types
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
import { getAccessToken } from '~/lib/auth_options'

// In server components, route handlers and server actions
const token = await getAccessToken()
const { decks } = await createServerTedrisatAPIs(token, env.TEDRISAT_API_BASE_URL)

const decks = await decks.getAllFlashcardDecks()
```

`getAccessToken()` reads the Keycloak access token out of the encrypted session
cookie, refreshes it when it has expired, and is memoized per request. Each app
builds it from `createAccessTokenReader` in `@medaris/services/auth`, supplying
its `NEXTAUTH_SECRET`, its session cookie name and its own `refreshAccessToken`.

### Client-Side Usage (React)

Since MDRS-28 the `Session` object no longer carries the access token — NextAuth
serves the session from `GET /api/auth/session` to any script on the page, so
the token must not be on it. Client components therefore cannot call tedrisat
directly with the user's token. Go through a server action (see
`~/lib/authenticated-action.ts` in each app) or a route handler under
`app/api/**`, both of which read the token server-side with `getAccessToken()`.

`createTedrisatAPIs` remains available for callers that hold a token some other
way (for example a service-to-service call with its own credential):

```typescript
import { createTedrisatAPIs } from '@medaris/services/tedrisat'

const { decks } = createTedrisatAPIs({
  baseUrl: process.env.NEXT_PUBLIC_TEDRISAT_API_BASE_URL!,
  token,
})
```

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
- `npm run lint` - Run ESLint

## Notes

- **Generated files**: Never manually edit files in `src/*/generated/` directories
- **Regeneration**: API clients are automatically regenerated during build
- **Swagger specs**: Keep swagger-docs files up to date with backend APIs