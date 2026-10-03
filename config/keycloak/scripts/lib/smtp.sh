# shellcheck shell=bash
# config/keycloak/scripts/lib/smtp.sh — the realm's mail sender (MDRS-98).
#
# Sourced by tools/keycloak/setup-realm.sh (its step 5) and by
# config/keycloak/scripts/provision, so the SMTP settings are configured one
# way only (MDRS-97). The environment is the source of record:
#
#   KC_SMTP_HOST              SMTP server host name; unset = step skipped
#   KC_SMTP_SECURITY          starttls (default) | ssl | none
#   KC_SMTP_PORT              default 465 with ssl, 587 otherwise
#   KC_SMTP_FROM              sender address; required
#   KC_SMTP_FROM_DISPLAY_NAME optional
#   KC_SMTP_REPLY_TO          optional
#   KC_SMTP_ENVELOPE_FROM     optional bounce address
#   KC_SMTP_USER              optional; set together with KC_SMTP_PASSWORD
#   KC_SMTP_PASSWORD          read through jq's $ENV only, never an argument
#   ALLOW_INSECURE_SMTP=1     required to combine credentials with
#                             KC_SMTP_SECURITY=none
#
# See docs/migration/mdrs-98-realm-mail-sender.md for why each refusal exists.

# smtp_check PREFIX — refuses a half-set or unsafe KC_SMTP_* environment, so a
# run fails before anything is written. A no-op while KC_SMTP_HOST is unset.
smtp_check() {
  local prefix="$1"
  [[ -n "${KC_SMTP_HOST:-}" ]] || return 0
  KC_SMTP_SECURITY="${KC_SMTP_SECURITY:-starttls}"
  if [[ "$KC_SMTP_SECURITY" == "ssl" ]]; then
    KC_SMTP_PORT="${KC_SMTP_PORT:-465}"
  else
    KC_SMTP_PORT="${KC_SMTP_PORT:-587}"
  fi
  # jq reads them through $ENV, which only sees exported variables.
  export KC_SMTP_HOST KC_SMTP_PORT KC_SMTP_SECURITY
  case "$KC_SMTP_SECURITY" in
    starttls | ssl | none) ;;
    *)
      echo "$prefix: KC_SMTP_SECURITY must be starttls, ssl or none, not '$KC_SMTP_SECURITY'." >&2
      exit 1
      ;;
  esac
  [[ "$KC_SMTP_PORT" =~ ^[0-9]+$ ]] || {
    echo "$prefix: KC_SMTP_PORT must be a number, not '$KC_SMTP_PORT'." >&2
    exit 1
  }
  [[ -n "${KC_SMTP_FROM:-}" ]] || {
    echo "$prefix: KC_SMTP_HOST is set but KC_SMTP_FROM is not; Keycloak needs a sender address." >&2
    exit 1
  }
  if [[ -n "${KC_SMTP_USER:-}" && -z "${KC_SMTP_PASSWORD:-}" ]] ||
    [[ -z "${KC_SMTP_USER:-}" && -n "${KC_SMTP_PASSWORD:-}" ]]; then
    echo "$prefix: set KC_SMTP_USER and KC_SMTP_PASSWORD together, or neither." >&2
    exit 1
  fi
  # Keyed on the Keycloak -> SMTP hop, not on KC_URL: a port-forward to a
  # production realm reads as localhost, and its mail still crosses the
  # internet.
  if [[ -n "${KC_SMTP_USER:-}" && "$KC_SMTP_SECURITY" == "none" && "${ALLOW_INSECURE_SMTP:-}" != "1" ]]; then
    echo "$prefix: KC_SMTP_SECURITY=none would send the SMTP password in cleartext. Use starttls or ssl, or set ALLOW_INSECURE_SMTP=1 for a test server on a private network." >&2
    exit 1
  fi
  export KC_SMTP_FROM KC_SMTP_FROM_DISPLAY_NAME KC_SMTP_REPLY_TO \
    KC_SMTP_ENVELOPE_FROM KC_SMTP_USER KC_SMTP_PASSWORD
}

# smtp_server [with-password] — prints the realm's `smtpServer` object built
# from the environment by jq itself ($ENV), so the password never appears in
# any argv. Keycloak stores every value as a string. Call smtp_check first.
smtp_server() {
  local with_password="${1:-}"
  jq -n --arg withPassword "$with_password" '
    {
      host: $ENV.KC_SMTP_HOST,
      port: $ENV.KC_SMTP_PORT,
      from: $ENV.KC_SMTP_FROM,
      fromDisplayName: ($ENV.KC_SMTP_FROM_DISPLAY_NAME // ""),
      replyTo: ($ENV.KC_SMTP_REPLY_TO // ""),
      envelopeFrom: ($ENV.KC_SMTP_ENVELOPE_FROM // ""),
      starttls: (if $ENV.KC_SMTP_SECURITY == "starttls" then "true" else "false" end),
      ssl: (if $ENV.KC_SMTP_SECURITY == "ssl" then "true" else "false" end),
      auth: (if ($ENV.KC_SMTP_USER // "") != "" then "true" else "false" end)
    }
    + (if ($ENV.KC_SMTP_USER // "") != ""
       then {user: $ENV.KC_SMTP_USER}
            + (if $withPassword == "with-password"
               then {password: $ENV.KC_SMTP_PASSWORD} else {} end)
       else {} end)'
}

# smtp_describe — one line for the log; never the password.
smtp_describe() {
  if [[ -n "${KC_SMTP_USER:-}" ]]; then
    echo "$KC_SMTP_FROM via $KC_SMTP_HOST:$KC_SMTP_PORT, $KC_SMTP_SECURITY, as $KC_SMTP_USER"
  else
    echo "$KC_SMTP_FROM via $KC_SMTP_HOST:$KC_SMTP_PORT, $KC_SMTP_SECURITY, no login"
  fi
}
