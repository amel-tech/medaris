# MDRS-102 — The privacy notice (Aydınlatma Metni), required at registration

Scope is the issue's four acceptance criteria. The final legal text, the
minors policy and the controller's details are out of scope; the design of the
page is MDRS-127's, so the page is a plain placeholder layout, **to be updated
when the design lands.**

## What was done

### The page (AC 1)

- `apps/landing/app/aydinlatma-metni/page.tsx` serves `/aydinlatma-metni`,
  static, with its own `layout.tsx` (`<html lang="tr">`). It sits **outside
  `[locale]`** and `apps/landing/middleware.ts`'s matcher excludes the path,
  so next-intl never redirects it to `/en/…`: one address, Turkish for
  everyone. landing has no sign-in at all.
- The text is in one content file, `apps/landing/content/aydinlatma-metni.ts`:
  the controller, the data processed (identity, contact, account and usage,
  enrollment records), the purposes, transfers (the identity server, hosting,
  and YouTube for recordings once MDRS-116 ships), the collection method and
  legal basis, the rights under Article 11, and how to apply.
- The account record's fields are listed from `ACCOUNT_RECORD_FIELDS`, one
  entry per column of tedrisat's `users` table (MDRS-104,
  `apps/tedrisat/src/database/schema/user.schema.ts`).
- `IS_DRAFT` puts a visible "this text is a draft" note on the page; the
  wording is a draft for the owner to approve.
- The address is one constant, `PRIVACY_NOTICE_PATH` / `PRIVACY_NOTICE_URL`
  (`https://medaris.app/aydinlatma-metni`) in `libs/utils/src/privacy-notice.ts`;
  landing-web now depends on `@medaris/utils` for it (package.json, tsconfig
  reference, `transpilePackages`).

### The placeholders (AC 3)

The five placeholders the issue names — controller title, address, e-mail,
KEP address, MERSİS number, each in square brackets — are the values of
`CONTROLLER` in the content file and are written nowhere else; the text reuses
them by reference. `grep -rn '\[Adres\]\|\[E-posta\]\|\[KEP adresi\]\|\[MERSİS no\]\|\[Veri sorumlusu unvanı\]' apps libs config`
finds exactly those five lines (plus the spec that checks it).

### The registration box (AC 2)

Implemented with the user profile, not the terms-and-conditions required
action: that one is shown *after* registration and needs a changed
registration flow, which `config/keycloak/scripts` does not provision.

- `config/keycloak/user-profile.json` gains `privacyNoticeRead`: required for
  the `user` role, a single `options` validator accepting only `yes`, rendered
  as one checkbox (`multiselect-checkboxes`). Keycloak refuses a registration
  whose form lacks it or carries any other value, whatever the page did. The
  value is stored on the user (`attributes.privacyNoticeRead = ["yes"]`).
  Users only edit it themselves; admins can see it.
- The annotations `linkUrl` (the notice's URL) and `linkLabel` are read by the
  theme: `UserProfileFormFields.tsx` renders the option label with a link
  that opens in a new tab (`target="_blank"`, `rel="noopener noreferrer"`),
  only for an `http(s)` URL; otherwise the same words appear without a link,
  never the `{0}` placeholder.
- Copy (`privacyNoticeTitle`, `privacyNoticeRead` with `{0}` for the link,
  `privacyNoticeLinkLabel`) in tr/en/ar in `src/login/i18n.ts`: "Aydınlatma
  Metni’ni okudum." in Turkish.
- `config/keycloak/scripts/validate` now allows this fifth attribute and
  fails when it is missing, not required for users, accepts anything but
  `yes`, or has no https `linkUrl`. RUNBOOK's table says so.
- The story mock (`KcPageStory.tsx`) carries the same attribute on
  `register.ftl` and `login-update-profile.ftl`, so the stories and the
  MDRS-100 page checks (no raw key, no English on tr/ar pages, no Latin on the
  Arabic page) now cover the box too.

Consequence to know: because the attribute is required, **an existing user
without it is asked to tick it** at the next sign-in (Keycloak's verify-profile
step renders `login-update-profile.ftl`, which shows the same box). The
`medaris` realm is new (MDRS-97), so this only concerns users made by hand.

The MDRS-100 terms page (`Terms.tsx`, `termsText`) is unchanged: the
terms-and-conditions required action stays off, and the privacy notice is not
the terms of use.

### Footers (AC 4)

- landing: a `privacyNotice` link first in the footer's legal row
  (`sections/footer/data.ts`), labelled from `landing.footer.privacyNotice`.
- tedris-web and nizam-web: `components/legal-footer` (server component,
  label `common.legal.privacyNotice`, opens `PRIVACY_NOTICE_URL` in a new tab),
  rendered by each `[locale]/layout.tsx`, i.e. on every page. nizam's client
  `AppLayout` takes it as a `footer` prop.
- nazir-web is not included: the issue names landing, tedris and nizam, and
  nazir is still the create-next-app placeholder with no layout of its own.

## What was verified

- `apps/landing/test/privacy-notice.spec.ts`: the page renders with
  `lang="tr"`, covers each of the seven topics and the data categories and
  recipients, lists every `users` column; the middleware matcher leaves the
  path alone (and still matches `/` and a longer path such as
  `/aydinlatma-metni-eski`); the five placeholders are the
  `CONTROLLER` values, each appears exactly once in the content file and in no
  other source file under `apps/`, `libs/`, `config/`; the footer links to the
  path with a label in tr/en/ar; the user profile's `linkUrl` is the same URL.
  Checked to fail with the path put back into the matcher and with a
  placeholder copied into another file.
- `apps/keycloak-theme/test/privacy-notice.spec.tsx`: on the register page in
  tr/en/ar the box is a checkbox in `kc-register-form`, marked required, with
  the translated label and a new-tab link to the notice; no link for a
  non-http URL (the same words, unlinked); the mock attribute equals `user-profile.json`'s. Checked to
  fail with the link rendering removed.
- `apps/tedrisat/test/e2e/keycloak-provision.e2e.spec.ts` (Keycloak 26.3.2,
  realm provisioned from `config/keycloak`): a registration posted **without
  the box, or with another value, is refused** — the form comes back, no
  user exists, and re-posting the same fields with the box ticked then
  succeeds, so the box was the only reason — while one with it registers, stores the attribute, verifies
  the e-mail and gets a token tedrisat accepts; `validate` fails when the box
  is not required; a second `provision` still changes nothing.
- `apps/tedris/test/legal-footer.spec.ts`, `apps/nizam/test/legal-footer.spec.ts`:
  the footer's link, target and label in tr/en/ar; the layout renders it.
- The gate (`nx affected -t typecheck test build lint module-boundaries`
  against the branch base) — see the PR for the run.

## What was not verified

- **The page and the box in a browser**, served by Next and by a Keycloak
  with the theme JAR. The page was rendered with `react-dom/server`, the theme
  with keycloakify's mock context in happy-dom; the e2e Keycloak has no theme
  installed, so it proves the server-side rule, not the rendered checkbox.
- **Ticking the box in the rendered form reaches Keycloak as
  `privacyNoticeRead=yes`.** The checkbox is `@medaris/ui`'s Radix checkbox,
  which posts through a hidden input inside a form; the same component
  already carries `termsAccepted` on the register page. Not exercised end to
  end.
- **The layout's look.** No design exists yet (MDRS-127).
- **The legal text.** Written as a draft covering what the issue lists; its
  wording, the legal bases chosen and the transfer abroad (YouTube) are for
  the owner and counsel.

- **The address `https://medaris.app/aydinlatma-metni`** is one constant for
  every environment (local, dev realm, production); that landing is served at
  the apex `medaris.app` was taken from `design-system/` and not checked
  against the deployment. Until this change is released there, the link
  answers 404.

## Follow-up

- The owner fills `CONTROLLER` and approves the text, then sets `IS_DRAFT` to
  false and updates `LAST_UPDATED`.
- When MDRS-127 designs the page: restyle `app/aydinlatma-metni/*`.
- **Which text was acknowledged is not recorded**: the attribute holds `yes`,
  not a version. Users who tick the box while the draft is live will not be
  asked again after the final text is published. Accepting only a version id
  (e.g. `2026-09-30`) and changing it with each new text would make Keycloak
  ask everyone again at their next sign-in.
- Keycloak's stock account console (the theme has no account part) lists the
  attribute with the raw `${privacyNoticeTitle}` label, because these
  messages live only in the login theme. Hiding it there (`view` for `admin`
  only) or adding the messages to the realm's localization is a follow-up.
- The footer component is written twice (`apps/tedris` and `apps/nizam`,
  `components/legal-footer`): it reads `next-intl/server`, and no shared lib
  both apps may import carries that dependency.
- Once provisioned to production (`provision prod`), register once on
  `auth.medaris.app` and confirm the box and its link on the real theme.
