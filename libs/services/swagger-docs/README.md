# Swagger Documentation

This directory contains OpenAPI/Swagger specifications for different backend services.

## Structure

- `tedrisat.json` - Tedrisat service API specification
- Add more service specifications as needed (e.g., `teskilat.json`, `muhasebe.json`)

## Usage

### Refresh a specification

`tedrisat.json` is **generated, not written**. It is the output of
`SwaggerModule.createDocument` inside `@medaris/tedrisat`, so the only correct
way to update it is to re-run the exporter from the repository root:

```bash
pnpm --filter @medaris/tedrisat run openapi:export
pnpm --filter @medaris/services run generate:tedrisat
```

In that order — the second command reads what the first writes. The exporter
boots the Nest container in preview mode, so it needs neither a database nor
Docker, and it pins the environment it depends on to the committed
`.env.example`, so the same checkout produces the same bytes on any machine.
See `apps/tedrisat/src/openapi/export-openapi.ts` for why.

Editing the JSON by hand looks like it works and then silently loses the edit
on the next export, which is how the spec came to describe version 0.1.4 of a
service that had moved on (MDRS-58).

### Generate API Clients

Generate all API clients:
```bash
npm run generate
```

Generate specific service:
```bash
npm run generate:tedrisat
```

### Adding New Services

1. Add the swagger specification file (e.g., `newservice.json`)
2. Add generation script to `package.json`:
   ```json
   "generate:newservice": "npx @openapitools/openapi-generator-cli generate -i swagger-docs/newservice.json -g typescript-fetch -o src/newservice/generated --additional-properties=typescriptThreePlus=true,supportsES6=true,npmName=@medaris/newserviceapi"
   ```
3. Update the `generate:all` script to include the new service
4. Add export in main package exports

## Generated Files

Generated API clients are placed in `src/{service}/generated/` and are automatically regenerated during build.

**Note:** Do not manually edit generated files as they will be overwritten.
