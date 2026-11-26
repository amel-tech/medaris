// A helper of realm.auth.forgotPassword's binding (realm.auth.forgotPassword/binding.yaml): hands the walk the link of the
// reset mail. Mailpit keeps what Keycloak sent; this reads it through the shared mail helper and writes the link where the
// binding's `mailed` data source reads it (graphs/.local/reset-link.env, git-ignored, mode 600, `LINK=<address>`).
//
//   node ../realm/auth/forgotPassword/reset-link.mjs <address>    waits up to 30 s for the reset mail to <address>, takes the
//                                                                 link of its newest one, prints `link ready`
//   node ../realm/auth/forgotPassword/reset-link.mjs --clear      removes the file, prints `cleared`
//
// The link is a one-time key of Keycloak's: it is never printed. It opens the new-password page; the walk that follows
// sets the account's own password again, so nothing of the account changes.
import { execFileSync } from "node:child_process";
import { chmodSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const mailHelper = fileURLToPath(
  new URL("../../../bindings/helpers/mail.mjs", import.meta.url)
);
const target = fileURLToPath(
  new URL("../../../.local/reset-link.env", import.meta.url)
);
const SUBJECT = "Şifrenizi sıfırlayın"; // passwordResetSubject, tr (apps/keycloak-theme/src/email/messages/messages_tr.properties:16)

const [arg] = process.argv.slice(2);
if (!arg) {
  console.error("usage: reset-link.mjs <address> | --clear");
  process.exit(2);
}
if (arg === "--clear") {
  rmSync(target, { force: true });
  console.log("cleared");
  process.exit(0);
}
let out;
try {
  out = execFileSync(
    "node",
    [
      mailHelper,
      "search",
      `to:${arg} subject:"${SUBJECT}"`,
      "--text",
      "--wait",
      "30",
    ],
    { encoding: "utf8" }
  );
} catch (e) {
  console.error(
    `reset-link: no reset mail to that address within 30 s (${String(e.stderr ?? e.message).trim()})`
  );
  process.exit(1);
}
const newest = JSON.parse(out.trim().split("\n")[0]);
const link = /https?:\/\/\S+\/login-actions\/action-token\?\S+/.exec(
  newest.text ?? ""
)?.[0];
if (!link) {
  console.error("reset-link: the newest reset mail holds no action-token link");
  process.exit(1);
}
writeFileSync(target, `LINK=${link}\n`, { mode: 0o600 });
chmodSync(target, 0o600);
console.log("link ready");
