# MDRS-98 — the realm's mail sender, from the environment

MDRS-98 asks for a production realm that actually delivers the verification
and password-reset e-mails. Most of it lives outside this repository: choosing
an SMTP provider, the sender domain's DNS records, the secret store, and real
inboxes. This change is the repository half: the realm provisioning script
takes the SMTP settings from the environment, so the credentials can come
straight from the secret store and never sit in a file.

## What was done

- `tools/keycloak/setup-realm.sh` gained a fifth step, **mail sender**. With
  `KC_SMTP_HOST` unset it prints `skipped` and leaves the realm's mail
  settings alone, so every existing caller behaves as before. With it set, it
  writes the realm's `smtpServer` from:

  | Variable | Meaning |
  | -- | -- |
  | `KC_SMTP_HOST` | SMTP server; turns the step on |
  | `KC_SMTP_SECURITY` | `starttls` (default), `ssl` or `none` |
  | `KC_SMTP_PORT` | default `465` with `ssl`, `587` otherwise |
  | `KC_SMTP_FROM` | sender address, e.g. `no-reply@<domain>`; required |
  | `KC_SMTP_FROM_DISPLAY_NAME` | optional |
  | `KC_SMTP_REPLY_TO` | optional |
  | `KC_SMTP_ENVELOPE_FROM` | optional bounce address (the domain SPF checks) |
  | `KC_SMTP_USER`, `KC_SMTP_PASSWORD` | optional, both or neither |
  | `ALLOW_INSECURE_SMTP=1` | required for credentials with `KC_SMTP_SECURITY=none` |

- The settings are **written on every run** while `KC_SMTP_HOST` is set. The
  script otherwise never reconfigures what exists, but here the environment
  is the source of record: rotating the password is a re-run. Keycloak only
  ever returns the stored password as `**********`, so it cannot be compared
  and is re-sent instead of being reported as unchanged.
- **The password never leaves the environment in readable form.** jq reads
  it through `$ENV` rather than `--arg`, and `api()` now sends every request
  body to curl on stdin (`--data-binary @-`) instead of as an argument — a
  command line is readable by every user of the machine. The script prints
  the host, port, security mode and user, never the password.
- **Refusals, all before anything is written:** `KC_SMTP_FROM` missing, only
  one of user/password set, an unknown `KC_SMTP_SECURITY`, a non-numeric port,
  and credentials with `KC_SMTP_SECURITY=none` unless `ALLOW_INSECURE_SMTP=1`
  (the SMTP password would travel in cleartext). That refusal does not look
  at `KC_URL`: the password crosses the Keycloak → SMTP hop, and a
  port-forward to a production realm reads as localhost.

No `.env.example` entry was added. The root `.env` feeds the applications;
this script is run by whoever provisions the realm, with the variables from
the secret store, and a placeholder in a committed file is exactly the kind
of place a real password gets pasted into.

## What was verified

`apps/tedrisat/test/e2e/keycloak-smtp.e2e.spec.ts`, against Keycloak
26.3.2 and a Mailpit container that accepts mail only after an SMTP AUTH with
one user and a per-run password (9 tests, green — 18/18 together with
`keycloak-audience.e2e.spec.ts`, whose runs now pin `KC_SMTP_HOST` empty so
a developer's shell cannot switch the step on there):

- The script writes host, port, sender, display name, user and security flags
  into the realm, and Keycloak returns the password masked.
- With `curl` and `jq` replaced on `PATH` by wrappers that log their argv,
  no recorded command line, and neither stdout nor stderr, contains the
  password.
- **AC 1 (repo half):** a verification e-mail arrives from
  `Medaris <no-reply@medaris.test>` within one minute (the wait gives up at
  60 s from the send), and following its link
  — confirm page included, in a browser with no session — marks the address
  verified.
- **AC 3 (repo half):** the "forgot password" form sends a reset e-mail from
  the same sender; its link, opened in a second browser, shows the new
  password form, and the password set there logs in.
- A re-run with a wrong password makes sending fail, and a re-run with the
  right one restores it — the realm uses the password from the environment,
  and rotation works.
- No `KC_SMTP_HOST` → `skipped`, the realm's sender untouched.
- `ssl` without a port stores port 465.
- Every refusal listed above.

## What was not verified

- **Gmail inbox, not spam (AC 1).** Needs the real provider and the real
  domain; Mailpit accepts everything and says nothing about spam placement.
- **SPF, DKIM and DMARC (AC 2).** DNS records of the sending domain; not in
  the repository. `KC_SMTP_ENVELOPE_FROM` exists so the bounce domain can be
  aligned, but no alignment was measured.
- **Password reset against the production realm (AC 3).** The test sets
  `resetPasswordAllowed` itself; turning it on in the real realm is MDRS-97's
  realm configuration.
- **"Credentials exist only in the secret store" (AC 4).** The repository
  holds none and the script reads them only from the environment; where the
  secret store is and who can read it cannot be checked from here.
- **STARTTLS/SSL against a real server.** The test server speaks plain SMTP;
  only the flags Keycloak stores for `starttls` and `ssl` were exercised, not
  a TLS handshake. Whether Keycloak 26.3.2 *requires* STARTTLS or merely
  tries it (a server that does not offer it would then receive the password
  in cleartext) was not checked; `KC_SMTP_SECURITY=ssl` on port 465 does not
  depend on that, and is the safer choice when the provider offers it.
- **Provider choice (What to build 1, 5).** The open-source evaluation form
  of `docs/PRD.md:377` and whether the provider also serves MDRS-121 are
  decisions, not code.

## Review findings

`/code-review` on this change raised ten points. Fixed: the cleartext refusal
now keys on the SMTP hop (`ALLOW_INSECURE_SMTP`), not on `KC_URL`; `ssl`
defaults to port 465; the argv test runs the script under logging wrappers
and also reads stderr; the script header no longer promises a no-op second
run while `KC_SMTP_HOST` is set; both Keycloak specs drop or pin the script's
variables inherited from the shell; a restore run in `finally` no longer
masks the assertion before it; the one-minute bound is the wait's own
deadline; the admin token is reused. Not changed: the helpers shared with
`apps/keycloak-theme/test/email.e2e.spec.ts` live in two projects with no
shared test library, and a relative import between apps is a boundary
violation. Deferred: the admin password and bearer token (below), and the
stale counts in `CLAUDE.md`.

## Follow-up

- `setup-realm.sh` still puts the master-realm admin password
  (`authenticate`, `--data-urlencode password=…`) and the admin bearer token
  (`-H "Authorization: Bearer …"`) on curl's command line. Both predate this
  change and outrank the SMTP password; moving them to stdin or a `--config`
  file is its own change.

- Provider, sender address, DNS records and the secret-store entry, then one
  run of `setup-realm.sh` against the production realm with `KC_SMTP_*` from
  the secret store, and the inbox tests of AC 1–3.
- MDRS-97, when it keeps the whole realm configuration in the repository,
  should call this step rather than configure SMTP a second way.
- `CLAUDE.md` says tedrisat has 25 suites of which 9 are e2e. Counted with
  `find test src -name '*.spec.ts'` in `apps/tedrisat` after this change: 43
  suites, 21 of them `test/e2e/*.e2e.spec.ts` — it was already stale before
  this spec. Left for whoever next edits that file.
