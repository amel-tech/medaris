// The walk data of nazar.courseSettings.partnerCodes: one partner application of the walk's own, registered through the
// başnazım's routes ("Ortak uygulamalar" in nizam), bound to a köşk, with codes mapped to a course, and taken away again. It
// is the binding's `setup`, `teardown`, `effects` and one `before`: `node partner.mjs up|add|switch|held|down ...` (run with
// graphs/bindings/ as the working directory, so the path of the command is ../nazar/courseSettings/partnerCodes/partner.mjs).
//
//   up     [--kosk <id>]            registers the partner (a partner that is registered already is left as it is), switches it
//                                   on, and binds it to exactly that köşk, or to none without --kosk. Safe to run twice.
//   add    --course <id> --codes <code,code>   maps each code to the course, as the başnazım. A code the course holds already
//                                   is no error (the API answers with the existing row).
//   switch on|off                   switches the partner on or off (a partner that is off is offered in no course)
//   race   none|off                 a step another person takes between the page being read and a press: `none` does nothing,
//                                   `off` switches the partner off (the binding's `before` of the state the press is made in, with
//                                   the scenario's own word, so the scenarios that do not race pass `none`)
//   held   --course <id>            prints `held <code>,<code>` (oldest first) or `held none`: the partner's codes the course
//                                   holds, as the API lists them. An `effects` check of a step, read as the başnazım.
//   down                            takes everything of the partner away: its codes (the API removes them when it unbinds the
//                                   köşk), then its row. Safe to run twice and when nothing was registered.
//
// The partner is `deneme-ortak-uygulama`, "Deneme ortak uygulaması": an invented client id that no Keycloak client carries
// (nothing here signs a partner in; the registry takes any id that is not one of the front-ends'). No other flow's partner is
// read or changed: the stack's example client `ornek-uygulama` and a partner another walk registers stay as they are.
//
// There is no route that deletes a partner ("a partner is never deleted, only disabled", partner-admin.service.ts), so `down`
// ends with the one SQL delete of this folder: the partner's rows of `partner_course_codes` and `integration_partners` (the
// köşk bindings go with the partner, ON DELETE CASCADE). What it cannot undo: the audit rows of the registry
// (integration_partner.create, .kosk_bind, .kosk_unbind, course.partner_code_add, course.partner_code_remove), which no route
// removes and nothing depends on. Run under the replay lock when walks are running and you run it by hand.
import { query } from "../../../bindings/helpers/db.mjs";
import {
  call,
  Fail,
  must,
  options,
  refusal,
  run,
} from "../../../bindings/helpers/lib.mjs";

const CLIENT = "deneme-ortak-uygulama";
const NAME = "Deneme ortak uygulaması";
const REGISTRY = "/nizam/partner-applications";
const USAGE =
  "usage: partner.mjs up [--kosk <id>] | add --course <id> --codes <code,code> | switch on|off | race none|off | held --course <id> | down";

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

async function switchTo(o) {
  const [state] = o.rest;
  if (state !== "on" && state !== "off") throw new Fail(USAGE, 2);
  await must("SYSTEM_ADMIN", "PATCH", `${REGISTRY}/${CLIENT}`, {
    enabled: state === "on",
  });
  console.log(`partner ${state}`);
}

async function race(o) {
  const [what] = o.rest;
  if (what === "none") console.log("race none");
  else if (what === "off") {
    await switchTo({ rest: ["off"] });
    console.log("race off");
  } else throw new Fail(USAGE, 2);
}

async function held(o) {
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

async function down() {
  // unbinding takes the partner's codes off the köşk's courses, each with its audit row; a partner that is not there is a 404
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
  await query(
    `delete from partner_course_codes where partner_client_id = '${CLIENT}'; delete from integration_partners where client_id = '${CLIENT}'`
  );
  console.log("partner removed");
}

run("partner", async () => {
  const [verb, ...args] = process.argv.slice(2);
  const o = options(args, { values: ["kosk", "course", "codes"] });
  if (verb === "up") await up(o);
  else if (verb === "add") await add(o);
  else if (verb === "switch") await switchTo(o);
  else if (verb === "race") await race(o);
  else if (verb === "held") await held(o);
  else if (verb === "down") await down();
  else throw new Fail(USAGE, 2);
});
