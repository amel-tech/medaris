// The walk data of nizam.courses.settingsAndPublish: a course of the walk's own in the seed's second köşk, and the two policies of that köşk put back
// exactly as they were. It is the binding's `setup`, `teardown`, `before` and `effects`: `node settings-data.mjs up|down|policy|interfere|state ...`, run
// from graphs/bindings/ as `node ../nizam/courses/settingsAndPublish/settings-data.mjs ...`. Only tedrisat's HTTP API is used, through helpers/lib.mjs (and
// helpers/course.mjs as a command); no SQL.
//
//   up [--draft] [--approval] [--talebe A,B]
//        First undoes what a walk that died left (`down`). Then records the köşk's two policies (graphs/.local/made/ssPolicy.json: alwaysRequireApproval and
//        recordingsNeverPublic of the seed's second köşk, "Kubbealtı Köşkü", read as the başnazım), and makes the course "Deneme dersi ssMain" with
//        helpers/course.mjs (tag ssMain): published (or a draft with --draft), one week of two LIVE celses "Celse 1" and "Celse 2" from tomorrow, MUDERRIS its
//        hoca, anyone takes a seat, open, not in person, Europe/Istanbul, no sample.
//        --talebe    the spare accounts that take a seat (APPLICANT_C,APPLICANT_D): they are ENROLLED, which is what the enrolled count of the Yayın card reads.
//        --approval  the course asks for approval from now on (PATCH /courses/<id> as the başnazım, after the talebe were seated, so that they stay ENROLLED
//                    and the page opens with "Kayıt onayı gereksin" ticked, as e2e courses#6 a3 reads it).
//        The ids go to graphs/.local/made/ssMain.json (course.mjs's own file, the data source `made`: {course, title, weeks, lessons, talebe}).
//   down
//        Takes everything away: the course (course.mjs remove: the talebe leave, the course goes with its celses and its notifications) and puts the köşk's two
//        policies back to the values recorded by `up`, only where they differ (each change is one audit row, kosk.policy_change), then deletes the record. Safe to
//        run twice, and on a course already gone. The audit rows of the walk stay: no route removes them.
//   policy approval|recordings on|off
//        Sets one of the köşk's policies as the köşk's nazım does on "Köşk ayarları" (PATCH /kosks/<kosk2>), for the walk that opens the page with the köşk's
//        approval policy on. `down` puts it back.
//   interfere none|version|policy|delete|hidden
//        What happens to the course or the köşk behind the page of the person who opened it, once (a second call of the same walk says `already` and does nothing,
//        so a walk that reaches the press again does not move what it has just read; `up` clears the mark):
//        version  someone else saves the course with no change of value: PATCH /courses/<id> with the zone it already has, as the hoca. Only the course version moves
//                 (the API bumps it whatever the value).
//        policy   the köşk's own "Kayıt her zaman onaylı" comes on (PATCH /kosks/<kosk2>), as the köşk's nazım does.
//        delete   the başnazım deletes the course (DELETE /courses/<id>).
//        hidden   the köşk's nazım hides the course (POST /courses/<id>/archive).
//   state
//        What the course and the köşk hold, read as the başnazım, on one line of JSON for an `effects` check:
//        {"isClosed":b,"requiresApproval":b,"inPerson":b,"timeZone":"...","sample":"Celse 1"|null,"status":"PUBLISHED"|"DRAFT","archived":b,
//         "alwaysRequireApproval":b,"recordingsNeverPublic":b}; `gone` for a course that is gone.
//
// Prints one short line on stdout; a refusal is one line on stderr and a non-zero exit. Nothing secret is printed. Run by hand, every command takes the replay lock
// (CONVENTIONS, round R2). It never touches a seeded course, the seed's first köşk or a policy of either beyond what `policy` says and `down` undoes.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Fail,
  LOCAL,
  must,
  options,
  run,
  seed,
} from "../../../bindings/helpers/lib.mjs";

const HELPERS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../bindings/helpers"
);
const TAG = "ssMain"; // the course's tag in helpers/course.mjs
const MADE = resolve(LOCAL, "made", `${TAG}.json`);
const POLICY = resolve(LOCAL, "made", "ssPolicy.json"); // the köşk's two policies as `up` found them, and the mark of the one interference
const usage =
  "usage: settings-data.mjs up [--draft] [--approval] [--talebe A,B] | down | policy approval|recordings on|off | interfere none|version|policy|delete|hidden | state";

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
};
function keepPolicy(data) {
  mkdirSync(dirname(POLICY), { recursive: true, mode: 0o700 });
  writeFileSync(POLICY, `${JSON.stringify(data)}\n`, { mode: 0o600 });
}

// another helper of graphs/bindings/helpers, run as a command; its failure is one line
function helper(file, ...args) {
  try {
    return execFileSync(process.execPath, [resolve(HELPERS, file), ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    throw new Fail(
      `${file} ${args.join(" ")}: ${String(e.stderr || e.message).trim()}`
    );
  }
}

const koskPath = () => `/kosks/${seed().kosk2}`;
const readKosk = async () =>
  (await must("SYSTEM_ADMIN", "GET", koskPath())).body;

// the köşk's nazım sets one policy, as the page and "Köşk ayarları" do
async function setPolicy(name, on, who = "KOSK_NAZIM") {
  const field = {
    approval: "alwaysRequireApproval",
    recordings: "recordingsNeverPublic",
  }[name];
  if (!field) throw new Fail(usage, 2);
  await must(who, "PATCH", koskPath(), { [field]: on });
  return field;
}

// puts the two policies back to what `up` found, only where they differ
async function restorePolicy() {
  const saved = readJson(POLICY);
  if (!saved?.original) return "none";
  const now = await readKosk();
  const put = [];
  for (const [name, field] of [
    ["approval", "alwaysRequireApproval"],
    ["recordings", "recordingsNeverPublic"],
  ]) {
    if (now[field] !== saved.original[field]) {
      // the başnazım puts it back: no platform policy that is on can refuse him (kosk.service.ts:235)
      await setPolicy(name, saved.original[field], "SYSTEM_ADMIN");
      put.push(field);
    }
  }
  rmSync(POLICY, { force: true });
  return put.length ? put.join(",") : "unchanged";
}

async function down() {
  helper("course.mjs", "remove", TAG);
  return restorePolicy();
}

async function up(flags) {
  await down(); // a walk that died leaves nothing for this one
  const kosk = await readKosk();
  keepPolicy({
    original: {
      alwaysRequireApproval: kosk.alwaysRequireApproval,
      recordingsNeverPublic: kosk.recordingsNeverPublic,
    },
    interfered: false,
  });
  const make = [
    "make",
    TAG,
    "--kosk",
    seed().kosk2,
    "--weeks",
    "1",
    "--lessons",
    "2",
  ];
  if (flags.draft) make.push("--draft");
  if (flags.talebe) make.push("--talebe", ...flags.talebe.split(","));
  const made = JSON.parse(helper("course.mjs", ...make));
  if (flags.approval)
    await must("SYSTEM_ADMIN", "PATCH", `/courses/${made.course}`, {
      requiresApproval: true,
    });
  return `up ${made.course}`;
}

async function interfere(how) {
  if (!["none", "version", "policy", "delete", "hidden"].includes(how))
    throw new Fail(usage, 2);
  if (how === "none") return "interfere none";
  const made = readJson(MADE);
  const saved = readJson(POLICY);
  if (!made?.course) throw new Fail("no course is recorded: run `up` first");
  if (saved?.interfered) return `interfere ${how} already`;
  if (how === "version") {
    const course = (
      await must("SYSTEM_ADMIN", "GET", `/courses/${made.course}`)
    ).body;
    await must("MUDERRIS", "PATCH", `/courses/${made.course}`, {
      timeZone: course.timeZone,
    });
  } else if (how === "policy") {
    await setPolicy("approval", true);
  } else if (how === "delete") {
    await must(
      "SYSTEM_ADMIN",
      "DELETE",
      `/courses/${made.course}`,
      undefined,
      [404]
    );
  } else if (how === "hidden") {
    await must("KOSK_NAZIM", "POST", `/courses/${made.course}/archive`);
  }
  if (saved) keepPolicy({ ...saved, interfered: true });
  return `interfere ${how} ${made.course}`;
}

async function state() {
  const made = readJson(MADE);
  if (!made?.course) throw new Fail("no course is recorded: run `up` first");
  const r = await must(
    "SYSTEM_ADMIN",
    "GET",
    `/courses/${made.course}`,
    undefined,
    [404]
  );
  if (r.status === 404) return "gone";
  const c = r.body;
  const kosk = await readKosk();
  const sample =
    (c.weeks ?? []).flatMap((w) => w.lessons ?? []).find((l) => l.isPreview)
      ?.title ?? null;
  return JSON.stringify({
    isClosed: c.isClosed,
    requiresApproval: c.requiresApproval,
    inPerson: c.inPerson,
    timeZone: c.timeZone,
    sample,
    status: c.status,
    archived: c.archivedAt != null,
    alwaysRequireApproval: kosk.alwaysRequireApproval,
    recordingsNeverPublic: kosk.recordingsNeverPublic,
  });
}

run("settings-data", async () => {
  const [verb, ...rest] = process.argv.slice(2);
  if (verb === "up") {
    const o = options(rest, {
      values: ["talebe"],
      flags: ["draft", "approval"],
    });
    if (o.rest.length) throw new Fail(usage, 2);
    console.log(await up(o));
  } else if (verb === "down") {
    if (rest.length) throw new Fail(usage, 2);
    console.log(`down ${await down()}`);
  } else if (verb === "policy") {
    if (rest.length !== 2 || !["on", "off"].includes(rest[1]))
      throw new Fail(usage, 2);
    console.log(
      `policy ${await setPolicy(rest[0], rest[1] === "on")} ${rest[1]}`
    );
  } else if (verb === "interfere") {
    if (rest.length !== 1) throw new Fail(usage, 2);
    console.log(await interfere(rest[0]));
  } else if (verb === "state") {
    if (rest.length) throw new Fail(usage, 2);
    console.log(await state());
  } else throw new Fail(usage, 2);
});
