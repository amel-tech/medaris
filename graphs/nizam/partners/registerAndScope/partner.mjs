// The walk data of nizam.partners.registerAndScope: the one partner application of the walk's own, registered through the
// başnazım's routes ("Ortak uygulamalar" in nizam), looked at, and taken away again. It is the binding's `setup`, `teardown`, `effects`
// and one `before`: `node partner.mjs up|show|add|race|down ...` (run with graphs/bindings/ as the working directory, so the path of
// the command is ../nizam/partners/registerAndScope/partner.mjs).
//
//   up     [--kosk <id>]            registers the partner (one that is registered already is left as it is), switches it on, gives it
//                                   its name and binds it to exactly that köşk, or to none without --kosk. Safe to run twice.
//   show                            prints `partner <client id> name=<name> enabled=on|off kosks=<n> codes=<n>`, or
//                                   `partner <client id> none` when nothing is registered: an `effects` check of a step, read as the
//                                   başnazım (the codes are counted with one SQL select, since no route lists every code).
//   switch on|off                   switches the partner on or off through the API, as the başnazım (a partner that is off is offered in no course)
//   add    --course <id> --codes <code,code>   maps each code to the course, as the başnazım (the partner must work with the course's
//                                   köşk). A code the course holds already is no error.
//   race   none|gone                a step another person takes between the page being read and a press: `none` does nothing, `gone`
//                                   takes the partner away (the same SQL as `down`, without the unbinding), so that the press is
//                                   answered 404 PARTNER_UNKNOWN. The binding's `before` of the state the press is made in.
//   down                            takes everything of the partner away: its codes (the API removes them when it unbinds the köşk),
//                                   then its row. Safe to run twice and when nothing was registered.
//
// The partner is `deneme-kayit-uygulamasi`, "Deneme kayıt uygulaması": an invented client id that no Keycloak client carries (nothing
// here signs a partner in; the registry takes any id that is not one of the front-ends'). It is not the client id of
// nazar.courseSettings.partnerCodes (`deneme-ortak-uygulama`), so the two walks never meet, and the stack's example client
// `ornek-uygulama` is never read or changed, nor is any partner another walk registers.
//
// There is no route that deletes a partner ("a partner is never deleted, only disabled", partner-admin.service.ts), so `down` and
// `race gone` use the one SQL delete of this folder: the partner's rows of `partner_course_codes`, `partner_enrollment_links` and
// `integration_partners` (the köşk bindings go with the partner, ON DELETE CASCADE). What it cannot undo: the audit rows of the
// registry (integration_partner.create, .rename, .enable, .disable, .kosk_bind, .kosk_unbind, course.partner_code_add,
// course.partner_code_remove), which no route removes and nothing depends on. Run under the replay lock when walks are running and
// you run it by hand.
import { query } from "../../../bindings/helpers/db.mjs";
import {
  call,
  Fail,
  must,
  options,
  refusal,
  run,
} from "../../../bindings/helpers/lib.mjs";

const CLIENT = "deneme-kayit-uygulamasi";
const NAME = "Deneme kayıt uygulaması";
const REGISTRY = "/nizam/partner-applications";
const USAGE =
  "usage: partner.mjs up [--kosk <id>] | show | switch on|off | add --course <id> --codes <code,code> | race none|gone | down";

async function up(o) {
  const made = await call("SYSTEM_ADMIN", "POST", REGISTRY, {
    clientId: CLIENT,
    name: NAME,
  });
  const exists =
    made.status === 409 &&
    typeof made.body === "object" &&
    made.body.code === "PARTNER_EXISTS";
  if (made.status !== 201 && !exists)
    throw new Fail(`registering the partner: ${refusal(made)}`);
  await must("SYSTEM_ADMIN", "PATCH", `${REGISTRY}/${CLIENT}`, {
    name: NAME,
    enabled: true,
  });
  const koskIds = o.kosk ? [o.kosk] : [];
  await must("SYSTEM_ADMIN", "PUT", `${REGISTRY}/${CLIENT}/kosks`, { koskIds });
  console.log(`partner up: ${CLIENT} bound to ${koskIds.length} köşk`);
}

async function codesHeld() {
  const out = await query(
    `select count(*)::int as n from partner_course_codes where partner_client_id = '${CLIENT}'`
  );
  return JSON.parse(out.trim().split("\n")[0]).n;
}

async function show() {
  const r = await must("SYSTEM_ADMIN", "GET", REGISTRY);
  const mine = (r.body?.items ?? []).find((p) => p.clientId === CLIENT);
  if (!mine) {
    console.log(`partner ${CLIENT} none`);
    return;
  }
  console.log(
    `partner ${CLIENT} name=${mine.name} enabled=${mine.enabled ? "on" : "off"} kosks=${mine.kosks.length} codes=${await codesHeld()}`
  );
}

async function switchTo(o) {
  const [state] = o.rest;
  if (state !== "on" && state !== "off") throw new Fail(USAGE, 2);
  await must("SYSTEM_ADMIN", "PATCH", `${REGISTRY}/${CLIENT}`, {
    enabled: state === "on",
  });
  console.log(`partner ${state}`);
}

async function add(o) {
  if (!o.course || !o.codes) throw new Fail(USAGE, 2);
  const codes = o.codes.split(",").filter(Boolean);
  for (const code of codes)
    await must("SYSTEM_ADMIN", "POST", `/courses/${o.course}/partner-codes`, {
      partner: CLIENT,
      code,
    });
  console.log(`codes ${o.course} ${codes.join(",")}`);
}

const DELETE_ROWS = `delete from partner_course_codes where partner_client_id = '${CLIENT}'; delete from partner_enrollment_links where partner_client_id = '${CLIENT}'; delete from integration_partners where client_id = '${CLIENT}'`;

async function race(o) {
  const [what] = o.rest;
  if (what === "none") console.log("race none");
  else if (what === "gone") {
    await query(DELETE_ROWS);
    console.log("race gone");
  } else throw new Fail(USAGE, 2);
}

async function down() {
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
  await query(DELETE_ROWS);
  console.log("partner removed");
}

run("partner", async () => {
  const [verb, ...args] = process.argv.slice(2);
  const o = options(args, { values: ["kosk", "course", "codes"] });
  if (verb === "up") await up(o);
  else if (verb === "show") await show();
  else if (verb === "switch") await switchTo(o);
  else if (verb === "add") await add(o);
  else if (verb === "race") await race(o);
  else if (verb === "down") await down();
  else throw new Fail(USAGE, 2);
});
