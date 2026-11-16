// A deck of a walk's own course, made and removed through tedrisat's HTTP API as the müderris of that course. It is the binding's `setup`,
// `teardown` and `effects`, for nazar.decks.siga (a draft "Sîga denemesi") and nazar.decks.publishAndDelete (a draft or published deck with
// three cards): `node helpers/course-deck.mjs make|remove|cards|gone <tag> ...`, run from graphs/bindings/.
//
//   make <tag> [--type VOCABULARY|HADEETH] [--title <text>] [--description <text>] [--published] [--cards <front=back,front=back>] [--unpublish]
//                                            opens a deck (POST /courses/:id/decks, as `MUDERRIS`) in the course that `helpers/course.mjs
//                                            make <tag>` recorded in graphs/.local/made/<tag>.json, and records it in
//                                            graphs/.local/made/<tag>-deck.json ({tag, course, deck, title, type, published}), which the
//                                            binding reads as a data source ({deck.deck}). The title is "Sîga denemesi" unless --title says
//                                            otherwise; the deck is a draft unless --published (no talebe sees a draft); --cards adds the
//                                            cards (POST /flashcard/decks/:id/cards, all VOCABULARY, in the order given). Making a tag again
//                                            removes the old deck first (with --unpublish, as `remove` does). Prints the record as JSON.
//   cards <tag>                              prints what the deck holds, for an `effects` check:
//                                            `cards <n> <TYPE> metas=<n> kips=<kip,kip> kok=<root> bab=<bab> first=<front> back=<back>`
//                                            where `first` is the card of the gâib, müzekker, müfred sîga of the mâzî (or the first card).
//   gone <tag>                               the müderris deletes the deck (DELETE /courses/:id/decks/:deckId), as the person who
//                                            "meanwhile" removes it does; a second `gone` says "already gone", and `remove` then has
//                                            nothing left to do for it.
//   remove <tag> [--unpublish] [--title <text>]
//                                            deletes the deck, and every deck of that title in the course (a crashed walk may have left
//                                            one); `none` when there is nothing. With --unpublish a deck is taken back to a draft first
//                                            (PATCH /courses/:id/decks/:deckId { draft: true }: a course deck is deleted only while it is a
//                                            draft, and a walk may have published it). Run it BEFORE `course.mjs remove`: a course's decks
//                                            are not deleted with it (decks.course_id is `on delete set null`), they stay behind as private
//                                            decks of their author. Prints `deck remove <tag> <result>`.
//
// The generator's cards are removed with the deck (the API deletes a draft deck with its cards). Nothing here writes a progress row, so none
// is left behind. Nothing secret is printed: no token, no password. Run it under the replay lock when walks are running and you run it by hand.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { call, Fail, LOCAL, must, options, run } from "./lib.mjs";

const HOCA = "MUDERRIS";
const TITLE = "Sîga denemesi";
const MADE = resolve(LOCAL, "made");
const usage =
  "usage: course-deck.mjs make <tag> [--type VOCABULARY|HADEETH] [--title T] [--description D] [--published] [--cards front=back,..] [--unpublish] | cards <tag> | gone <tag> | remove <tag> [--unpublish] [--title T]";

const courseFile = (tag) => resolve(MADE, `${tag}.json`);
const deckFile = (tag) => resolve(MADE, `${tag}-deck.json`);
const read = (file) =>
  existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;

function keep(tag, made) {
  mkdirSync(MADE, { recursive: true, mode: 0o700 });
  writeFileSync(deckFile(tag), `${JSON.stringify(made)}\n`, { mode: 0o600 });
}

// the draft decks of that title in the course, whatever the file says
async function titled(course, title) {
  const r = await call(HOCA, "GET", `/courses/${course}/decks/manage`);
  if (r.status !== 200 || !Array.isArray(r.body)) return []; // the course is gone: nothing to list
  return r.body.filter((d) => d.title === title).map((d) => d.id);
}

async function remove(tag, o = {}) {
  const made = read(deckFile(tag));
  const course = made?.course ?? read(courseFile(tag))?.course;
  const ids = new Set(made?.deck ? [made.deck] : []);
  if (course)
    for (const id of await titled(course, o.title ?? made?.title ?? TITLE))
      ids.add(id);
  let deleted = 0;
  for (const id of ids) {
    // a published deck is refused with 409 COURSE_DECK_NOT_DRAFT: the way back is to a draft first
    if (course && o.unpublish)
      await call(HOCA, "PATCH", `/courses/${course}/decks/${id}`, {
        draft: true,
      });
    let r = course
      ? await call(HOCA, "DELETE", `/courses/${course}/decks/${id}`)
      : { status: 404 };
    // the course is gone and the deck stayed behind as the author's own: the deck's own route takes it
    if (r.status === 404)
      r = await call(HOCA, "DELETE", `/flashcard/decks/${id}`);
    if (r.status >= 200 && r.status < 300) deleted += 1;
    else if (r.status !== 404 && r.status !== 403)
      throw new Fail(`DELETE of deck ${id} answered ${r.status}`);
  }
  if (existsSync(deckFile(tag))) rmSync(deckFile(tag));
  return ids.size === 0 ? "none" : `${deleted} of ${ids.size} deleted`;
}

async function make(tag, o) {
  const made = read(courseFile(tag));
  if (!made?.course)
    throw new Fail(
      `graphs/.local/made/${tag}.json is missing: run helpers/course.mjs make ${tag} first`
    );
  const title = o.title ?? TITLE;
  await remove(tag, { unpublish: o.unpublish, title });
  const type = o.type ?? "VOCABULARY";
  if (!["VOCABULARY", "HADEETH"].includes(type))
    throw new Fail(`--type is VOCABULARY or HADEETH, not ${type}`, 2);
  const cards = (o.cards ?? "")
    .split(",")
    .filter(Boolean)
    .map((pair) => {
      const at = pair.indexOf("=");
      if (at < 1)
        throw new Fail(`--cards is front=back,front=back, not ${pair}`, 2);
      return {
        type: "VOCABULARY",
        contentFront: pair.slice(0, at),
        contentBack: pair.slice(at + 1),
      };
    });
  const r = await must(HOCA, "POST", `/courses/${made.course}/decks`, {
    title,
    ...(o.description ? { description: o.description } : {}),
    cardType: type,
    draft: o.published !== true,
  });
  const out = {
    tag,
    course: made.course,
    deck: r.body.id,
    title,
    type,
    published: o.published === true,
  };
  // written at once, so a failure below still leaves the id `remove` needs
  keep(tag, out);
  if (cards.length)
    await must(HOCA, "POST", `/flashcard/decks/${r.body.id}/cards`, cards);
  return out;
}

async function cards(tag) {
  const made = read(deckFile(tag));
  if (!made?.deck) throw new Fail(`no deck recorded for ${tag}`);
  const r = await must(HOCA, "GET", `/flashcard/cards?deckId=${made.deck}`);
  const list = Array.isArray(r.body) ? r.body : [];
  const metas = list.map((c) => c.contentMeta).filter(Boolean);
  const first =
    list.find(
      (c) =>
        c.contentMeta?.kip === "mazi" &&
        c.contentMeta?.sahis === "gaib" &&
        c.contentMeta?.cinsiyet === "muzekker" &&
        c.contentMeta?.sayi === "mufred"
    ) ?? list[0];
  const kips = [...new Set(metas.map((m) => m.kip))].sort().join(",");
  const distinct = new Set(
    metas.map((m) =>
      [m.kok, m.bab, m.kip, m.sahis, m.cinsiyet, m.sayi].join("|")
    )
  ).size;
  return `cards ${list.length} ${first?.type ?? "-"} metas=${distinct} kips=${kips || "-"} kok=${first?.contentMeta?.kok ?? "-"} bab=${first?.contentMeta?.bab ?? "-"} first=${first?.contentFront ?? "-"} back=${first?.contentBack ?? "-"}`;
}

async function gone(tag) {
  const made = read(deckFile(tag));
  if (!made?.deck) throw new Fail(`no deck recorded for ${tag}`);
  const r = await call(
    HOCA,
    "DELETE",
    `/courses/${made.course}/decks/${made.deck}`
  );
  if (r.status === 404) return `deck ${made.deck} already gone`; // a walk may reach its state more than once
  if (r.status < 200 || r.status >= 300)
    throw new Fail(`DELETE of deck ${made.deck} answered ${r.status}`);
  return `deck ${made.deck} deleted`;
}

run("course-deck", async () => {
  const o = options(process.argv.slice(2), {
    values: ["type", "title", "description", "cards"],
    flags: ["published", "unpublish"],
  });
  const { rest } = o;
  const [verb, tag, ...more] = rest;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$/.test(tag ?? "") || more.length)
    throw new Fail(usage, 2);
  if (verb === "make") console.log(JSON.stringify(await make(tag, o)));
  else if (verb === "cards") console.log(await cards(tag));
  else if (verb === "gone") console.log(await gone(tag));
  else if (verb === "remove")
    console.log(`deck remove ${tag} ${await remove(tag, o)}`);
  else throw new Fail(usage, 2);
});
