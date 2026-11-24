// What the medrese page of tedris.discover.readMadrasah must never send a visitor, checked on the wire by the binding's `effects`.
//
//   node ../tedris/discover/readMadrasah/page-check.mjs visitor
//
// Reads the page as a caller with no token, once as HTML and once as the flight payload a client navigation asks for (header RSC: 1), and
// checks, for each, that it carries neither a meeting link (e2e madrasah#2: "never sends the meeting link"; the stack's seeded celses carry
// https://meet.example.test/... links, so the check can fail) nor the başmüderris's account id (the finding overview-exposes-head-id: the
// API gives the id to a caller with no token, this page must not pass it on). The id is read from graphs/.local/accounts.env inside this
// process and is never printed, never put in argv and never written anywhere. Prints one line and exits 0, or one line on stderr and exits 1.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const local = new URL("../../../.local/", new URL(`file://${here}`));
const seed = JSON.parse(readFileSync(new URL("seed.json", local), "utf8"));
let headId;
for (const line of readFileSync(new URL("accounts.env", local), "utf8").split(
  "\n"
)) {
  const m = /^\s*E2E_MEDRESE_BASMUDERRIS_SUB\s*=\s*(.*?)\s*$/.exec(line);
  if (m) headId = m[1].replace(/^(["'])(.*)\1$/, "$2");
}
if (!headId) {
  console.error(
    "page-check: the stack gives no başmüderris id to compare with (E2E_MEDRESE_BASMUDERRIS_SUB)"
  );
  process.exit(1);
}

const base = process.env.TEDRIS_URL ?? "http://localhost:4000";
const forbidden = [
  ["a meeting link", "meet.example.test"],
  ["the başmüderris's account id", headId],
];
const problems = [];
for (const [how, headers] of [
  ["HTML", {}],
  ["flight payload", { RSC: "1" }],
]) {
  const r = await fetch(`${base}/madrasahs/${seed.madrasah}`, { headers });
  const body = await r.text();
  if (r.status !== 200) problems.push(`${how}: status ${r.status}`);
  for (const [what, needle] of forbidden)
    if (body.includes(needle)) problems.push(`${how} carries ${what}`);
}
if (problems.length > 0) {
  console.error(`page-check: ${problems.join("; ")}`);
  process.exit(1);
}
console.log(
  "page-check visitor ok: no meeting link and no başmüderris id in the HTML or the flight payload"
);
