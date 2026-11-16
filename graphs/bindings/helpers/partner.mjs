// A partner application of a walk's own, registered through the başnazım's routes ("Ortak uygulamalar" in nizam), looked at, bound to a köşk,
// with codes mapped to a course, and taken away again. It is the binding's `setup`, `teardown`, `effects` and `before`, for
// nizam.partners.registerAndScope (client `deneme-kayit-uygulamasi`, "Deneme kayıt uygulaması") and nazar.courseSettings.partnerCodes
// (client `deneme-ortak-uygulama`, "Deneme ortak uygulaması"): `node helpers/partner.mjs <verb> --client <id> ...`, run with graphs/bindings/
// as the working directory. The two flows use two client ids, so their walks never meet; the stack's example client `ornek-uygulama` and
// a partner another walk registers are never read or changed.
//
//   up     --client <id> --name <name> [--kosk <id>]   registers the partner (one that is registered already is left as it is), switches it
//                                   on, gives it its name and binds it to exactly that köşk, or to none without --kosk. Safe to run twice.
//   show   --client <id>            prints `partner <client id> name=<name> enabled=on|off kosks=<n> codes=<n>`, or
//                                   `partner <client id> none` when nothing is registered: an `effects` check of a step, read as the
//                                   başnazım (the codes are counted with one SQL select, since no route lists every code).
//   held   --client <id> --course <id>   prints `held <code>,<code>` (oldest first) or `held none`: the partner's codes the course
//                                   holds, as the API lists them. An `effects` check of a step, read as the başnazım.
//   switch --client <id> on|off     switches the partner on or off through the API, as the başnazım (a partner that is off is offered in no course)
//   add    --client <id> --course <id> --codes <code,code>   maps each code to the course, as the başnazım (the partner must work with the
//                                   course's köşk). A code the course holds already is no error (the API answers with the existing row).
//   race   --client <id> none|off|gone   a step another person takes between the page being read and a press: `none` does nothing, `off`
//                                   switches the partner off, `gone` takes the partner away (the same SQL as `down`, without the
//                                   unbinding), so that the press is answered 404 PARTNER_UNKNOWN. The binding's `before` of the state
//                                   the press is made in, with the scenario's own word, so the scenarios that do not race pass `none`.
//   down   --client <id>            takes everything of the partner away: its codes (the API removes them when it unbinds the köşk),
//                                   then its row. Safe to run twice and when nothing was registered.
//
// There is no route that deletes a partner ("a partner is never deleted, only disabled", partner-admin.service.ts), so `down` and
// `race gone` use the one SQL delete: the partner's rows of `partner_course_codes`, `partner_enrollment_links` and `integration_partners`
// (the köşk bindings go with the partner, ON DELETE CASCADE). nazar.courseSettings.partnerCodes used to delete the first and the last only;
// it has no enrollment link, so the extra delete finds none. What it cannot undo: the audit rows of the registry (integration_partner.create,
// .rename, .enable, .disable, .kosk_bind, .kosk_unbind, course.partner_code_add, course.partner_code_remove), which no route removes and
// nothing depends on. Nothing here signs a partner in: the registry takes any client id that is not one of the front-ends'. Run under the
// replay lock when walks are running and you run it by hand.
import { query } from "./db.mjs";
import { call, Fail, must, options, refusal, run } from "./lib.mjs";

const REGISTRY = "/nizam/partner-applications";
const USAGE =
  "usage: partner.mjs up --client <id> --name <name> [--kosk <id>] | show --client <id> | held --client <id> --course <id> | switch --client <id> on|off | add --client <id> --course <id> --codes <code,code> | race --client <id> none|off|gone | down --client <id>";

// the partner a call is about: the client id is the one thing every verb needs
const clientOf = (o) => {
  if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(o.client ?? ""))
    throw new Fail(
      `--client <id> is a short name of lower case letters, digits and dashes, not ${o.client}`,
      2
    );
  return o.client;
};

async function up(o) {
  const CLIENT = clientOf(o);
  if (!o.name) throw new Fail(USAGE, 2);
  const made = await call("SYSTEM_ADMIN", "POST", REGISTRY, {
    clientId: CLIENT,
    name: o.name,
  });
  const exists =
    made.status === 409 &&
    typeof made.body === "object" &&
    made.body.code === "PARTNER_EXISTS";
  if (made.status !== 201 && !exists)
    throw new Fail(`registering the partner: ${refusal(made)}`);
  await must("SYSTEM_ADMIN", "PATCH", `${REGISTRY}/${CLIENT}`, {
    name: o.name,
    enabled: true,
  });
  const koskIds = o.kosk ? [o.kosk] : [];
  await must("SYSTEM_ADMIN", "PUT", `${REGISTRY}/${CLIENT}/kosks`, { koskIds });
  console.log(`partner up: ${CLIENT} bound to ${koskIds.length} köşk`);
}

async function codesHeld(CLIENT) {
  const out = await query(
    `select count(*)::int as n from partner_course_codes where partner_client_id = '${CLIENT}'`
  );
  return JSON.parse(out.trim().split("\n")[0]).n;
}

async function show(o) {
  const CLIENT = clientOf(o);
  const r = await must("SYSTEM_ADMIN", "GET", REGISTRY);
  const mine = (r.body?.items ?? []).find((p) => p.clientId === CLIENT);
  if (!mine) {
    console.log(`partner ${CLIENT} none`);
    return;
  }
  console.log(
    `partner ${CLIENT} name=${mine.name} enabled=${mine.enabled ? "on" : "off"} kosks=${mine.kosks.length} codes=${await codesHeld(CLIENT)}`
  );
}

async function held(o) {
  const CLIENT = clientOf(o);
  if (!o.course) throw new Fail(USAGE, 2);
  const r = await must(
    "SYSTEM_ADMIN",
    "GET",
    `/courses/${o.course}/partner-codes`
  );
  const mine = (r.body?.partners ?? []).find((p) => p.id === CLIENT);
  const codes = (mine?.codes ?? []).map((c) => c.code);
  console.log(`held ${codes.length ? codes.join(",") : "none"}`);
}

async function switchTo(o) {
  const CLIENT = clientOf(o);
  const [state] = o.rest;
  if (state !== "on" && state !== "off") throw new Fail(USAGE, 2);
  await must("SYSTEM_ADMIN", "PATCH", `${REGISTRY}/${CLIENT}`, {
    enabled: state === "on",
  });
  console.log(`partner ${state}`);
}

async function add(o) {
  const CLIENT = clientOf(o);
  if (!o.course || !o.codes) throw new Fail(USAGE, 2);
  const codes = o.codes.split(",").filter(Boolean);
  for (const code of codes)
    await must("SYSTEM_ADMIN", "POST", `/courses/${o.course}/partner-codes`, {
      partner: CLIENT,
      code,
    });
  console.log(`codes ${o.course} ${codes.join(",")}`);
}

const deleteRows = (CLIENT) =>
  `delete from partner_course_codes where partner_client_id = '${CLIENT}'; delete from partner_enrollment_links where partner_client_id = '${CLIENT}'; delete from integration_partners where client_id = '${CLIENT}'`;

async function race(o) {
  const CLIENT = clientOf(o);
  const [what] = o.rest;
  if (what === "none") console.log("race none");
  else if (what === "off") {
    await switchTo({ client: CLIENT, rest: ["off"] });
    console.log("race off");
  } else if (what === "gone") {
    await query(deleteRows(CLIENT));
    console.log("race gone");
  } else throw new Fail(USAGE, 2);
}

async function down(o) {
  const CLIENT = clientOf(o);
  // unbinding takes the partner's codes off the köşks' courses, each with its audit row; a partner that is not there is a 404
  const unbound = await call(
    "SYSTEM_ADMIN",
    "PUT",
    `${REGISTRY}/${CLIENT}/kosks`,
    {
      koskIds: [],
    }
  );
  if (unbound.status !== 200 && unbound.status !== 404)
    throw new Fail(`unbinding the partner: ${refusal(unbound)}`);
  await query(deleteRows(CLIENT));
  console.log("partner removed");
}

run("partner", async () => {
  const [verb, ...args] = process.argv.slice(2);
  const o = options(args, {
    values: ["client", "name", "kosk", "course", "codes"],
  });
  if (verb === "up") await up(o);
  else if (verb === "show") await show(o);
  else if (verb === "held") await held(o);
  else if (verb === "switch") await switchTo(o);
  else if (verb === "add") await add(o);
  else if (verb === "race") await race(o);
  else if (verb === "down") await down(o);
  else throw new Fail(USAGE, 2);
});
