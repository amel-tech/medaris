// MDRS-66: the root-.env bootstrap lives in exactly one place, `@medaris/env`.
// The workspace has one .env, at the repository root, and its keys are prefixed
// by app (`TESKILAT__PORT` -> `PORT`). This module applies it to process.env and
// must be imported FIRST in main.ts — ./otel and ConfigModule both read the
// environment as they are evaluated.
//
// MDRS-25 resolved the loader by walking up for pnpm-workspace.yaml and skipped
// in silence when it found nothing, which let this process boot fully configured
// by the ambient environment with no signal that the file had never been looked
// for. That silence was MDRS-66's actual bug. The walk-up now lives once, in
// @medaris/env, and throws instead — the same behaviour the four next.config.js
// call sites get. The runtime image therefore carries pnpm-workspace.yaml and
// libs/env; see the runner stage of this app's Dockerfile.
import { loadRootEnv } from "@medaris/env";

loadRootEnv("teskilat");
