// What nazar.recordings.add's walk needs that the shared helpers do not give: the dates it types, and one thing another person does while the
// walk's dialog is open. The course itself is helpers/course.mjs's ("Deneme dersi recAdd"), set up in the binding's `setup`.
//
//   node ../nazar/recordings/add/data.mjs dates      writes graphs/.local/recordings-add.json (git-ignored): the times the walk types into "Açılış tarihi
//                                                    ve saati", on the course's clock (Europe/Istanbul), as the date box and the time box read them
//   node ../nazar/recordings/add/data.mjs clear      removes that file
//   node ../nazar/recordings/add/data.mjs meanwhile <none|record|revoke> <courseId> <lessonId>
//                                                    what happens between the walk opening the dialog and pressing its submit:
//                                                    none    nothing
//                                                    record  the müderris adds a recording to that celse through the API, so the walk's own add is
//                                                            refused with RECORDING_EXISTS (the answer `moved`)
//                                                    revoke  the müderris takes every permission off the ders nazırı's post in the course, so the walk's
//                                                            own add is refused with AUTHZ_FORBIDDEN (the answer `refused`)
//
// The file holds: later {date, time, when}  a time three days ahead at noon; `when` is how the page says it ("24 Kasım 12:00", the toast and the row
//                                           add "’de" after the clock)
//                 past  {date, time}        a time that has passed
//                 empty {date, time}        nothing typed
// Prints `recordings-add <command> <what was done>` and nothing secret. Run it under the replay lock when walks are running and you run it by hand.
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  call,
  Fail,
  LOCAL,
  refusal,
  run,
} from "../../../bindings/helpers/lib.mjs";

const FILE = resolve(LOCAL, "recordings-add.json");
const ZONE = "Europe/Istanbul";
const DAY = 86_400_000;
const here = dirname(fileURLToPath(import.meta.url));
const helpers = resolve(here, "../../../bindings/helpers");

// the date box reads "GG.AA.YYYY" in Turkish: two digits for the day and the month
function numeric(ms) {
  const parts = new Intl.DateTimeFormat("tr-TR", {
    timeZone: ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date(ms));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("day")}.${get("month")}.${get("year")}`;
}

const dayMonth = (ms) =>
  new Intl.DateTimeFormat("tr-TR", {
    timeZone: ZONE,
    day: "numeric",
    month: "long",
  }).format(new Date(ms));

function dates() {
  const ahead = Date.now() + 3 * DAY;
  mkdirSync(LOCAL, { recursive: true });
  writeFileSync(
    FILE,
    `${JSON.stringify({
      later: {
        date: numeric(ahead),
        time: "12:00",
        when: `${dayMonth(ahead)} 12:00`,
      },
      past: { date: "01.01.2020", time: "12:00" },
      empty: { date: "", time: "" },
    })}\n`,
    { mode: 0o600 }
  );
  return "written";
}

async function meanwhile(kind, course, lesson) {
  if (kind === "none") return "none";
  if (!course || !lesson)
    throw new Fail(`meanwhile ${kind} needs a course id and a celse id`, 2);
  if (kind === "record") {
    // a second call finds the celse recorded already: 409 is as good as 201
    const r = await call("MUDERRIS", "POST", `/lessons/${lesson}/recordings`, {
      title: "Başka bir kayıt",
      url: "https://www.youtube.com/watch?v=Xy9zAbCd1eF",
      visibility: "ENROLLED",
    });
    if (r.status === 201) return "record added";
    if (r.status === 409) return "record there already";
    throw new Fail(refusal(r));
  }
  if (kind === "revoke") {
    const r = spawnSync(
      process.execPath,
      [
        resolve(helpers, "course-nazir-grants.mjs"),
        "--course",
        course,
        "--nazir",
        "dersNazir",
        "--codes",
        "none",
      ],
      { encoding: "utf8", cwd: helpers }
    );
    if (r.status !== 0)
      throw new Fail(
        `course-nazir-grants failed: ${(r.stderr || r.stdout).trim()}`
      );
    return "grants taken off";
  }
  throw new Fail(`meanwhile: ${kind} is none, record or revoke`, 2);
}

run("recordings-add", async () => {
  const [mode, ...args] = process.argv.slice(2);
  const usage =
    "usage: data.mjs dates | clear | meanwhile <none|record|revoke> <courseId> <lessonId>";
  let done;
  if (mode === "dates" && args.length === 0) done = dates();
  else if (mode === "clear" && args.length === 0) {
    rmSync(FILE, { force: true });
    done = "removed";
  } else if (mode === "meanwhile" && args.length >= 1 && args.length <= 3)
    done = await meanwhile(...args);
  else throw new Fail(usage, 2);
  console.log(`recordings-add ${mode} ${done}`);
});
