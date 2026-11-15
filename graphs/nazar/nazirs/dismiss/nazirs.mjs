// The walk data of nazar.nazirs.dismiss, made and removed through tedrisat's HTTP API: a nazır of the seeded medrese who holds some
// permissions and has handed a seat and a post in a course on to two other people, so that the dismissal dialog has rows to ask about. It is the
// binding's `setup` and `teardown`: `node ../nazar/nazirs/dismiss/nazirs.mjs up|down|state|ders ...` (the working directory is graphs/bindings/).
//
//   up    --madrasah <id> --nazir ACC --case bare|holder|giverOne|giverMany [--medrese ACC] [--ders ACC --course <id>]
//   down  --madrasah <id> --nazir ACC [--medrese ACC] [--ders ACC --course <id>]
//   state --madrasah <id> --who ACC       prints `nazir <KEY> none` or `nazir <KEY> held, appointed by <KEY|someone>`: the roster, read as the başmüderris
//   ders  --course <id> --who ACC         prints `ders <KEY> none` or `ders <KEY> held`: the course's ders nazırları, read as the başmüderris
//
// ACC is the role key of an account in graphs/.local/accounts.env or the name a binding gives it (APPLICANT_A, applicantA). Only spare talebe
// accounts are ever appointed, never the seed's own nazır (MEDRESE_NAZIR). What `up` does, each step as the person who may:
//   1. clears what an aborted walk left of these accounts (the same as `down`), so every start is the same;
//   2. the başmüderris appoints the nazır (POST /madrasahs/:id/nazirs/:userId: no permission);
//   3. unless the case is `bare`, the başmüderris gives them madrasah.nazir_appoint and course_nazir.assign (PUT .../permissions, every course);
//   4. the nazır appoints --medrese a medrese nazır (the same POST, as the nazır: a nazır holding madrasah.nazir_appoint appoints);
//   5. the nazır appoints --ders a ders nazırı of --course with no permission (POST /courses/:id/nazirs: one holding course_nazir.assign by a grant
//      "only appoints"). A nazır gives no permission on (MDRS-108), so these are the only rows the API lets a nazır make.
// `down` dismisses --nazir with a Düşür for every person it listed, takes the ders nazırı's post away, and dismisses --medrese (who stays a nazır
// after a Devral). Each step tolerates "not there"; the last line says what is left. Nothing secret is printed: no password, no token.
import {
  accountKey,
  call,
  env,
  Fail,
  must,
  options,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const HEAD = "basmuderris";
const CODES = ["madrasah.nazir_appoint", "course_nazir.assign"];
const CASES = ["bare", "holder", "giverOne", "giverMany"];

const usage = (what) =>
  new Fail(
    `usage: nazirs.mjs up|down|state|ders ... (${what}); see the header of the file`,
    2
  );

/** Dismisses `who` as the başmüderris, dropping everything they gave; "none" when they are not a nazır of the medrese. */
async function dismiss(madrasah, who) {
  const sub = subOf(who);
  const grants = await call(
    HEAD,
    "GET",
    `/madrasahs/${madrasah}/nazirs/${sub}/grants`
  );
  if (grants.status === 404) return "none";
  if (grants.status !== 200)
    throw new Fail(`${accountKey(who)}: grants read answered ${grants.status}`);
  const decisions = grants.body.map((row) => ({
    userId: row.user.id,
    action: "DROP",
  }));
  const done = await call(
    HEAD,
    "DELETE",
    `/madrasahs/${madrasah}/nazirs/${sub}`,
    { decisions }
  );
  if (done.status !== 204 && done.status !== 404)
    throw new Fail(
      `${accountKey(who)}: the dismissal answered ${done.status} ${done.body?.code ?? ""}`.trim()
    );
  return `dismissed (${decisions.length} dropped)`;
}

/** Takes `who`'s ders nazırı post in the course away, as the başmüderris; "none" when there is none or the course is gone. */
async function endPost(course, who) {
  const list = await call(HEAD, "GET", `/courses/${course}/nazirs`);
  if (list.status === 404) return "none";
  if (list.status !== 200)
    throw new Fail(`the ders nazırları were not read (status ${list.status})`);
  const post = (list.body.items ?? []).find(
    (p) => p.user?.id?.toLowerCase() === subOf(who).toLowerCase()
  );
  if (!post) return "none";
  const done = await call(
    HEAD,
    "DELETE",
    `/courses/${course}/nazirs/${post.id}`
  );
  if (done.status >= 300 && done.status !== 404)
    throw new Fail(
      `the post of ${accountKey(who)} was not taken away (status ${done.status} ${done.body?.code ?? ""})`.trim()
    );
  return "ended";
}

/** What is left of the walk's accounts: the order is the nazır first (so what it gave is dropped with it), then the posts, then the people it seated. */
async function clear(o) {
  const left = [];
  const step = async (label, fn) => {
    try {
      await fn();
    } catch (e) {
      left.push(`${label}: ${e.message}`);
    }
  };
  if (o.ders && o.course)
    await step("ders post", () => endPost(o.course, o.ders));
  await step(`nazır ${o.nazir}`, () => dismiss(o.madrasah, o.nazir));
  if (o.medrese)
    await step(`nazır ${o.medrese}`, () => dismiss(o.madrasah, o.medrese));
  return left;
}

const need = (o, ...names) => {
  for (const n of names) if (!o[n]) throw usage(`--${n} is missing`);
};

run("nazirs", async () => {
  const [verb, ...rest] = process.argv.slice(2);
  const o = options(rest, {
    values: ["madrasah", "nazir", "case", "medrese", "ders", "course", "who"],
  });
  if (o.rest.length) throw usage(`unexpected ${o.rest.join(" ")}`);

  if (verb === "up") {
    need(o, "madrasah", "nazir", "case");
    if (!CASES.includes(o.case)) throw usage(`--case is ${CASES.join(", ")}`);
    if (o.case === "giverOne" && !o.medrese)
      throw usage("giverOne needs --medrese");
    if (o.case === "giverMany" && !(o.medrese && o.ders && o.course))
      throw usage("giverMany needs --medrese, --ders and --course");
    const left = await clear(o);
    if (left.length) throw new Fail(`could not clear: ${left.join("; ")}`);
    const m = o.madrasah;
    const nazir = subOf(o.nazir);
    await must(HEAD, "POST", `/madrasahs/${m}/nazirs/${nazir}`);
    if (o.case !== "bare")
      await must(HEAD, "PUT", `/madrasahs/${m}/nazirs/${nazir}/permissions`, {
        groupId: null,
        permissions: CODES,
        courseIds: null,
        expiresAt: null,
      });
    if (o.medrese)
      await must(o.nazir, "POST", `/madrasahs/${m}/nazirs/${subOf(o.medrese)}`);
    if (o.ders)
      await must(o.nazir, "POST", `/courses/${o.course}/nazirs`, {
        userId: subOf(o.ders),
        permissions: [],
      });
    console.log(
      `ready: ${accountKey(o.nazir)} is a nazır (${o.case})${o.medrese ? `, gave a seat to ${accountKey(o.medrese)}` : ""}${o.ders ? `, a post in the course to ${accountKey(o.ders)}` : ""}`
    );
  } else if (verb === "down") {
    need(o, "madrasah", "nazir");
    const left = await clear(o);
    if (left.length) throw new Fail(`not restored: ${left.join("; ")}`);
    console.log(
      `restored: ${accountKey(o.nazir)}${o.medrese ? `, ${accountKey(o.medrese)}` : ""}${o.ders ? `, ${accountKey(o.ders)}` : ""} hold nothing in the medrese`
    );
  } else if (verb === "state") {
    need(o, "madrasah", "who");
    const roster = (await must(HEAD, "GET", `/madrasahs/${o.madrasah}/nazirs`))
      .body;
    const sub = subOf(o.who).toLowerCase();
    const row = roster.find((r) => r.user?.id?.toLowerCase() === sub);
    if (!row) return console.log(`nazir ${accountKey(o.who)} none`);
    const by = row.appointedBy?.id?.toLowerCase();
    const key =
      Object.keys(env())
        .map((k) => /^E2E_(.+)_SUB$/.exec(k)?.[1])
        .find((k) => k && env()[`E2E_${k}_SUB`]?.toLowerCase() === by) ??
      "someone";
    console.log(`nazir ${accountKey(o.who)} held, appointed by ${key}`);
  } else if (verb === "ders") {
    need(o, "course", "who");
    const list = await call(HEAD, "GET", `/courses/${o.course}/nazirs`);
    const sub = subOf(o.who).toLowerCase();
    const held =
      list.status === 200 &&
      (list.body.items ?? []).some((p) => p.user?.id?.toLowerCase() === sub);
    console.log(`ders ${accountKey(o.who)} ${held ? "held" : "none"}`);
  } else {
    throw usage("the first word is up, down, state or ders");
  }
});
