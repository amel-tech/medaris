/**
 * `src/otel.ts` runs before anything else `main.ts` requires, and the
 * OpenTelemetry auto-instrumentations only patch modules loaded after
 * `sdk.start()`. If `otel.ts` pulls `@medaris/common` in — directly, or via the
 * config factory, which imports it — pino, winston and @nestjs/core are already
 * cached by then and their spans silently disappear. Typecheck, build and every
 * other test stay green when that happens, so the import list is pinned here
 * (MDRS-85 review).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "../../src/otel.ts"), "utf8");
// `from "…"`, a bare side-effect `import "…"` and `require("…")`, in either
// quote style: each of them loads the module before `sdk.start()`.
const specifiers = [
  ...source.matchAll(
    /(?:\bfrom\s+|\bimport\s+|\brequire\s*\()["']([^"']+)["']/g
  ),
].map((m) => m[1]);

const allowed = (specifier: string) =>
  specifier.startsWith("@opentelemetry/") ||
  specifier === "process" ||
  specifier === "../package.json";

describe("otel.ts bootstrap", () => {
  it("imports only the OpenTelemetry SDK, process and package.json", () => {
    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers.filter((s) => !allowed(s))).toEqual([]);
  });
});
