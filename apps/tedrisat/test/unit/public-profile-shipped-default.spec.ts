import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * MDRS-141: a deployment that does nothing gets the hidden profile. The app's
 * own default is pinned in config.spec.ts, but docker-compose.yml always sets
 * the variable, so the app default never applies there, and the parity gate
 * (tools/ci/assert-env-compose-parity.mjs) only checks that the key reaches the
 * container, not what it is set to. These two files carry the shipped default.
 */
const repoRoot = resolve(__dirname, "../../../..");
const read = (file: string) => readFileSync(resolve(repoRoot, file), "utf8");

describe("the shipped default of the public profile switch (MDRS-141)", () => {
  it("is false in docker-compose.yml, after both prefixed names", () => {
    const line = read("docker-compose.yml")
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("PUBLIC_PROFILE_ENABLED:"));
    expect(line, "PUBLIC_PROFILE_ENABLED is set in docker-compose.yml").toMatch(
      /^PUBLIC_PROFILE_ENABLED: \$\{TEDRISAT__PUBLIC_PROFILE_ENABLED:-\$\{API__PUBLIC_PROFILE_ENABLED:-false\}\}$/
    );
  });

  it("is false in .env.example", () => {
    const lines = read(".env.example")
      .split("\n")
      .filter((l) => /^\s*API__PUBLIC_PROFILE_ENABLED=/.test(l));
    expect(lines).toEqual(["API__PUBLIC_PROFILE_ENABLED=false"]);
  });
});
