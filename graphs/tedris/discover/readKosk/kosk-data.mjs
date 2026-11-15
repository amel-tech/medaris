// The data of tedris.discover.readKosk's walks: the one köşk the seed does not hold, what tedrisat says a reader will find on a
// köşk's page, and the evidence for F-4. Setup, teardown and `effects` of the flow's binding.
//
//   node ../tedris/discover/readKosk/kosk-data.mjs up                               makes the unlisted köşk, writes its id to graphs/.local/readkosk.json
//   node ../tedris/discover/readKosk/kosk-data.mjs down                             deletes it and empties that file
//   node ../tedris/discover/readKosk/kosk-data.mjs measure <ACCOUNT|none> <koskId> <key>
//                                                                                   what the page of <koskId> will show that reader, under <key> of the file
//                                                                                   (the binding's scenarios all use the key `now`, each after its own setup)
//   node ../tedris/discover/readKosk/kosk-data.mjs summary <ACCOUNT|none> <koskId>  what the köşk read answers that reader, without any id
//
// `up` makes, through tedrisat's own API as the başnazım (no SQL): POST /kosks with isPrivate true, the seed's köşk nazımı as its one
// nazım (so the page names a manager) and no description. A köşk opened so has no course and the seed gives it none. It is the
// walk's own, found by its short name: a walk that died before its teardown is cleaned by the next `up`, and the seed's two köşks are
// never touched.
// `measure` asks the two reads the page makes (GET /kosks/{id} and GET /kosks/{id}/courses) as that reader, with the same token or none,
// and counts what the cards will draw: courses, badges, in-person labels, medrese lines, hoca lines, next celses. The walk compares the
// page with the API's own answer, so the check does not break when another walk leaves a course in a seed köşk. It never writes.
// `summary` is the F-4 evidence: whether ownerId and managerIds came back, never their values.
// `none` asks with no token, as a visitor's page does. Nothing secret is printed, and no person's id is ever printed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  API,
  call,
  Fail,
  LOCAL,
  must,
  run,
  subOf,
} from "../../../bindings/helpers/lib.mjs";

const HANDLE = "gizli-okuma";
const NAME = "Gizli Okuma Köşkü";
const FILE = resolve(LOCAL, "readkosk.json");

const readFile = () =>
  existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8") || "{}") : {};
const writeFile = (data) => writeFileSync(FILE, JSON.stringify(data));

/** GET as the reader: an account of the stack, or `none` for a request with no token. */
const read = async (who, path) => {
  if (who === "none") {
    const res = await fetch(`${API}${path}`, {
      headers: { accept: "application/json" },
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  }
  return call(who, "GET", path);
};

const remove = async () => {
  const found = (
    await must(
      "SYSTEM_ADMIN",
      "GET",
      `/kosks/directory?q=${encodeURIComponent(HANDLE)}&limit=50`
    )
  ).body;
  const same = (found.items ?? []).filter(
    (k) => (k.handle ?? "").replace(/^@/, "").toLowerCase() === HANDLE
  );
  for (const k of same) await must("SYSTEM_ADMIN", "DELETE", `/kosks/${k.id}`);
  return same.length;
};

run("kosk-data", async () => {
  const [mode, ...args] = process.argv.slice(2);
  mkdirSync(LOCAL, { recursive: true });

  if (mode === "up" && args.length === 0) {
    const gone = await remove();
    const made = (
      await must("SYSTEM_ADMIN", "POST", "/kosks", {
        name: NAME,
        handle: HANDLE,
        isPrivate: true,
        managerUserIds: [subOf("KOSK_NAZIM")],
      })
    ).body;
    if (!made?.id || made.isPrivate !== true)
      throw new Fail("the köşk was made, but it is not unlisted");
    writeFile({ ...readFile(), unlisted: made.id, name: NAME });
    console.log(`kosk-data up unlisted made (cleared ${gone} before)`);
    return;
  }

  if (mode === "down" && args.length === 0) {
    const gone = await remove();
    writeFile({});
    console.log(`kosk-data down removed ${gone}`);
    return;
  }

  if (mode === "measure" && args.length === 3) {
    const [who, id, key] = args;
    const k = await read(who, `/kosks/${id}`);
    if (k.status !== 200)
      throw new Fail(`GET /kosks/${id} as ${who}: HTTP ${k.status}`);
    const c = await read(who, `/kosks/${id}/courses`);
    if (c.status !== 200)
      throw new Fail(`GET /kosks/${id}/courses as ${who}: HTTP ${c.status}`);
    const cards = c.body;
    const seats = ["ENROLLED", "PENDING", "COMPLETED"];
    const measured = {
      name: k.body.name,
      courseCount: k.body.courseCount,
      courses: cards.length,
      badges: cards.filter((x) => seats.includes(x.enrollment?.status)).length,
      inPersons: cards.filter((x) => x.inPerson).length,
      madrasahLines: cards.filter((x) => x.madrasah).length,
      hocaLines: cards.filter((x) => (x.muderris ?? []).length > 0).length,
      nextSessions: cards.filter((x) => x.nextSessionAt).length,
      noNextSessions: cards.filter((x) => !x.nextSessionAt).length,
      managerName: k.body.managerName ?? "",
      description: k.body.description ?? "",
    };
    writeFile({ ...readFile(), [key]: measured });
    console.log(
      `kosk-data measure ${key} ${measured.courses} courses, ${measured.badges} badges`
    );
    return;
  }

  if (mode === "summary" && args.length === 2) {
    const [who, id] = args;
    const r = await read(who, `/kosks/${id}`);
    if (r.status !== 200)
      throw new Fail(`GET /kosks/${id} as ${who}: HTTP ${r.status}`);
    const k = r.body;
    console.log(
      `getKosk ${who} ownerId=${k.ownerId ? "present" : "null"} managerIds=${(k.managerIds ?? []).length} managerName=${k.managerName ? "set" : "none"} isPrivate=${k.isPrivate}`
    );
    return;
  }

  throw new Fail(
    "usage: kosk-data.mjs up | down | measure <ACCOUNT|none> <koskId> <key> | summary <ACCOUNT|none> <koskId>",
    2
  );
});
