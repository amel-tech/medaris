# MDRS-100 — The login theme's copy in tr/en/ar, the pages after "Kayıt ol", and the e-mails

Scope is the issue's four acceptance criteria. The launch designs A3–A8 do not
exist yet (MDRS-127, and nothing for them is in `design-system/`), so every
page and e-mail here is a **placeholder built from the existing Login page's
look** (`libs/ui` components, the `brand-primary` classes, the sky-900 brand
colour); **they are to be updated when the design lands.** Which of the pages
below the brief numbers A3…A7 could not be checked — the brief is not in the
repository.

## What was done

### Copy in code, in three languages (AC 1)

- `apps/keycloak-theme/src/login/i18n.ts` now passes keycloakify's
  `withCustomTranslations` an inline object with the same keys for `en`, `tr`
  and `ar`. It supplies the two keys Keycloak does not define
  (`loginAccountSubtitle`, `registerSubtitle` — the pages printed the key
  itself), the Turkish entries Keycloak's `tr` set lacks (it has 271 of the 470
  English login messages), the field-validation and server messages a
  registrant can meet, and the product's own wording where it differs from
  Keycloak's ("Giriş yap" / "Kayıt ol", as in `libs/i18n`). Two Arabic defaults
  were wrong and are overridden (`updatePasswordTitle` said "password updated";
  `doTryAnotherWay` had a typo).
- No value contains an ASCII apostrophe: keycloakify copies these strings into
  `messages_*.properties`, and Keycloak formats those with
  `java.text.MessageFormat`, where `'` starts a quoted section. `’` is used.
- The four `addToXKeycloakifyMessagesIfMessageKey` lines in `vite.config.ts`
  stay: a realm-level override still wins over the in-code copy, so it can be
  changed without a release, but nothing depends on one existing.
- The new pages and Login/Register now take their button, link and field-error
  classes from `src/login/components/styles.ts`, so a restyle is one edit.
- Template: the hard-coded English "User" badge now reads the `username`
  message; the two decorative background images have `alt=""` instead of the
  English "Madrasah Background".

### The pages a registrant can reach (AC 2)

Eight new page components, each with Storybook stories (`Default`,
`DefaultTurkish`, `DefaultArabic`, `DefaultEnglish`, plus a state or two), all
rendered through this theme's `Template` with `doUseDefaultCss={false}` —
before, they fell through to keycloakify's `DefaultPage`, which loads
Keycloak's PatternFly CSS on top of the theme:

| Page | Component |
| -- | -- |
| `login-verify-email.ftl` | `LoginVerifyEmail` — resend is a link, not a "click here" sentence |
| `info.ftl` | `Info` |
| `login-update-profile.ftl` | `LoginUpdateProfile` — same field renderer as Register |
| `terms.ftl` | `Terms` — the text is `termsText`; the real notice is MDRS-102 |
| `login-reset-password.ftl` | `LoginResetPassword` |
| `login-update-password.ftl` | `LoginUpdatePassword` |
| `login-page-expired.ftl` | `LoginPageExpired` — two buttons instead of two "click here" links |
| `error.ftl` | `ErrorPage` (named so it does not shadow the global `Error`) |

The shared button/link classes moved to `src/login/components/styles.ts`.

### E-mail templates (AC 3)

`apps/keycloak-theme/src/email` is a native FreeMarker e-mail theme
(`parent=base`, `locales=en,tr,ar`) that keycloakify packs into the same JAR —
`META-INF/keycloak-themes.json` now lists `"types": ["email", "login"]`. It
overrides the verification and password-reset e-mails, HTML and text; the
HTML ones share `html/medaris-layout.ftl` (brand bar, one button, the link
repeated as text). All copy is in `messages/messages_{en,tr,ar}.properties`.
Every other e-mail still comes from Keycloak's base theme. The layout is
deliberately **not** named `template.ftl`: Keycloak resolves `<#import
"template.ftl">` in the child theme first, so the inherited e-mails (execute
actions, SMTP test, update e-mail, …) would have picked up a macro with
required parameters and failed to send — caught in review, now covered by the
e2e spec.

### Arabic (AC 4)

keycloakify already sets `<html dir="rtl">` for `ar`. What broke was the
fields: an e-mail or password typed into a right-to-left input starts on the
side the show-password button covers. Username, e-mail and password inputs now
carry `dir="ltr"` (Login, Register and the profile form via
`UserProfileFormFields`, and the new pages). The e-mails put the direction on
`<html>`/`<body>` from a per-language message (`emailDirection`) and keep the
link itself left-to-right.

### Test target

`keycloak-theme` had none. It now has `vitest run` with `happy-dom` (new
catalog entry) and `testcontainers`; see `apps/keycloak-theme/vitest.config.ts`
for why happy-dom is configured the way it is. Four spec files:

- `test/pages.spec.tsx` — renders each of the ten registrant pages in tr, en
  and ar: no message whose text is still its key, no camelCase key-like word,
  no string the Turkish or Arabic page shares with the English one, no
  Latin-script copy on the Arabic page, `dir="rtl"` on the Arabic page with
  `dir="ltr"` on the credential fields, a label for every field and a
  show-password button for every password field, and no Keycloak stylesheet
  inserted. Two further tests show the checks can fail (an unimplemented page
  does insert PatternFly; an unknown key is caught), and one checks every
  page has its three language stories.
- `test/i18n.spec.ts` — evaluates the `withCustomTranslations` argument the
  way `keycloakify build` does, and checks every key the pages use plus the
  validation and server messages: present in all three languages, not the
  English text in tr or ar, Arabic script in ar, no ASCII apostrophe.
- `test/email.spec.ts` — the e-mail theme is complete and consistent across
  the three languages, and its templates ask only for messages it defines.
- `test/email.e2e.spec.ts` — Keycloak 26.3.2 with `src/email` mounted as a
  folder theme and a Mailpit container: for a user with `locale` en, tr and ar,
  the admin "send verify e-mail" call and the "forgot password" form each
  deliver our template, subject and copy in that user's language, `dir="rtl"`
  for Arabic, and Keycloak's own wording of the link lifetime in that language
  ("12 saat", "12 ساعة"). One more case sends an e-mail the theme inherits
  (execute actions) to prove the base e-mails still work; with a
  `template.ftl` in the theme it fails. This makes `-t test` for the project
  need Docker.

## What was verified

- The gate (`nx affected -t typecheck test build lint module-boundaries`
  against the branch base) — see the PR for the run.
- Deliberately breaking it: with `src/login/i18n.ts` put back to its previous
  version, 23 of the 92 page tests fail (raw `registerSubtitle` /
  `loginAccountSubtitle`, English left on Turkish and Arabic pages).
- `keycloakify build` (with a Maven downloaded for the run; the gate has no
  target for it) produced both JARs; the JAR contains
  `theme/medaris-keycloak-theme/email/**` and the login `messages_tr.properties`
  carries the new copy (e.g. `registerSubtitle`, `doLogIn=Giriş yap`).

## What was not verified

- **Matching the design (AC 2, second half).** There is no design yet
  (MDRS-127). The pages and e-mails are placeholders.
- **The theme pages inside a real Keycloak in a browser.** The pages were
  rendered by the tests with keycloakify's mock contexts, not served by
  Keycloak with the JAR installed; no screenshot was taken.
- **Mail clients.** The HTML e-mail was checked as delivered to Mailpit, not
  rendered in Gmail, Outlook or Apple Mail, and not with Arabic in any of them.
- **The production realm.** The theme only takes effect once the realm's
  login and e-mail themes are set to `medaris-keycloak-theme`, SMTP is
  configured and internationalization offers tr/en/ar — that is MDRS-97/98/99.

## Follow-up

- When MDRS-127 delivers A3–A8: restyle these pages and `html/medaris-layout.ftl`
  to the design, and replace the placeholder `termsText` with the text MDRS-102
  publishes.
- A user who registers is only e-mailed in their language if Keycloak stores
  their `locale` (the e2e spec sets it by hand). That Keycloak stores the
  language the registration page was shown in was **not verified** here;
  check it on the dev realm once MDRS-97 provisions it.
- Pages outside the registrant path (OTP, WebAuthn, IdP linking, logout
  confirmation, …) still use keycloakify's `DefaultPage` with Keycloak's CSS.
