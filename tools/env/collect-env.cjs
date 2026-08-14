#!/usr/bin/env node
//
// Assemble a root .env from the per-app files a machine already has (MDRS-25).
//
// Run once, when moving a checkout from the old six-file layout to the single
// root file. It writes nothing: review the output, then redirect it.
//
//   pnpm env:collect > .env
//   # review, then delete the old files:
//   rm apps/*/.env
//
// Keys are hoisted as far as they will go — agreed across both groups becomes
// shared, agreed within one group becomes WEB__/API__, and only genuine
// disagreements stay per app. Those leftovers are the drift: each one is either
// a real difference that deserves a comment, or a copy-paste to resolve.

const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const {
  APPS,
  API_APPS,
  WEB_APPS,
  findRepoRoot,
  parseEnv,
} = require("./root-env.cjs");

const root = findRepoRoot();
if (!root) {
  console.error("collect-env: pnpm-workspace.yaml bulunamadı.");
  process.exit(1);
}

const seen = new Map();
for (const app of APPS) {
  const path = join(root, "apps", app, ".env");
  if (!existsSync(path)) continue;
  for (const { key, value } of parseEnv(readFileSync(path, "utf8"))) {
    if (!seen.has(key)) seen.set(key, new Map());
    seen.get(key).set(app, value);
  }
}

if (seen.size === 0) {
  console.error(
    "collect-env: apps/*/.env yok — toplanacak bir şey bulunamadı. " +
      "Muhtemelen geçiş zaten yapılmış; `.env.example` dosyasını kopyalayın."
  );
  process.exit(1);
}

const agreed = (pairs) => {
  const values = new Set(pairs.map(([, value]) => value));
  return values.size === 1 ? [...values][0] : null;
};

const shared = [];
const grouped = [];
const perApp = [];

for (const [key, byApp] of seen) {
  const present = [...byApp];
  const web = present.filter(([app]) => WEB_APPS.includes(app));
  const api = present.filter(([app]) => API_APPS.includes(app));

  const everywhere = agreed(present);
  if (everywhere !== null && web.length > 0 && api.length > 0) {
    shared.push(`${key}=${everywhere}`);
    continue;
  }

  for (const [group, members] of [
    ["WEB", web],
    ["API", api],
  ]) {
    if (members.length === 0) continue;
    const value = members.length > 1 ? agreed(members) : null;
    if (value !== null) grouped.push(`${group}__${key}=${value}`);
    else
      for (const [app, v] of members)
        perApp.push(`${app.toUpperCase()}__${key}=${v}`);
  }
}

process.stdout.write(
  [
    "# Assembled from the existing apps/*/.env files by `pnpm env:collect`.",
    "# Review before adopting: a key that only happens to agree today has been",
    "# hoisted, and everything under `per app` disagreed between apps — each of",
    "# those is a drift to resolve or to justify with a comment.",
    "",
    "# --- shared ---",
    ...shared.sort(),
    "",
    "# --- per group ---",
    ...grouped.sort(),
    "",
    "# --- per app ---",
    ...perApp.sort(),
    "",
  ].join("\n")
);
