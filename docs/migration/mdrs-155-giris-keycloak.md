# MDRS-155: the sign-in pages on the unified design (stack-25)

Canvas screens `medaris/01` (sign in), `03` (register), `05` and `17` (info),
`07` (new password), `12` (sign-in not completed), `13` (page expired) and `14`
(sign-out confirmation). All class A: no backend, no migration, no endpoint.
The e-mail screens (04, 06, 15, 18..23) need SMTP and are not built.

## What was done

- `libs/ui/src/giris/` (new, exported as `@medaris/ui/giris`): provider-free React,
  props only (canvas rule 44). `AuthCard`, `LoginForm`, `RegisterForm`,
  `UpdatePasswordForm`, `PasswordField`, `PasswordRules`, `AuthMessage`,
  `LogoutConfirmForm`, and `evaluatePasswordRules` / `passwordProblems`.
  Built from the `.mds-*` kit (Base UI `Field`, `Input`, `Checkbox`, `Button`,
  `IconButton`); placement is Tailwind utilities, no new CSS class layer.
- `apps/keycloak-theme/src/login`: `Template` now draws `AuthCard`; `Login`,
  `Register`, `Info`, `LoginUpdatePassword`, `ErrorPage`, `LoginPageExpired` are
  adapters that read `kcContext` / `msg()` and pass plain props; `LogoutConfirm`
  is new (`logout-confirm.ftl` used to fall to `DefaultPage`). Login, Register and
  the others render with `doUseDefaultCss={false}`.
- Copy: `i18n.ts` carries the canvas wording in tr, en and ar (about 35 new keys,
  eleven reworded). Turkish moves to the canvas's "sen" register on these pages.
- `Logo` got an `arabic` prop (default: on at `lg`, as before); the card turns it
  off because the canvas lockup is the mark and "Medaris" only.
- `Field` got an `invalid` prop for a control whose reason is shown elsewhere
  (the login page's Alert).
- The text faces load from a `<link>` with preconnect in `Template` (rule 39).
  `@medaris/tokens` became a dependency of `keycloak-theme` (lockfile: 3 lines).
- Removed `src/login/assets/background.png`; nothing referenced it any more.
- `apps/keycloak-theme/e2e` + `playwright.config.ts` + Nx `test:e2e` (picked up
  from the package script): the first browser e2e for the theme.

## Decisions worth knowing

- The theme loads both stylesheets: the legacy `globals.css` (the pages still on
  shadcn: verify-email, update-profile, terms, reset-password, `UserProfileFormFields`)
  and `medaris.css`. Tailwind's preflight, still pulled in by `globals.css`,
  removes link underlines; `src/login/giris.css` writes them back inside the
  system's text classes only. Both go when the last page leaves the shadcn kit.
- Register draws exactly the five attributes of `config/keycloak/user-profile.json`
  (`REGISTER_ATTRIBUTES`); a unit test fails if the profile gains another.
  reCAPTCHA is not drawn (the realm does not use it). The generic profile form
  (`UserProfileFormFields`) stays for `login-update-profile`.
- The password rules are a preview; Keycloak's realm policy
  (`length(10) and notEmail and notUsername`) is still the authority. The length
  comes from `passwordPolicies.length`, default 10.
- `login-update-password` prints the account name from `kcContext.username` (not
  in keycloakify's types, present in Keycloak's template), falling back to
  `auth.attemptedUsername`, then to a sentence without it. With
  `registrationEmailAsUsername` off this is the user name, not the e-mail address
  the canvas shows. The e-mail rule there compares against that same value.
- `info.ftl`: Keycloak prints one sentence as title and body when it sends no
  `messageHeader`. The page shows it once, except for the verified-e-mail
  message, which is split into the canvas's title and sentence by matching the
  theme's own `emailVerifiedMessage`. Canvas 17 ("E-posta adresin değişti") is the
  same page and works when Keycloak sends a header; which key the real
  e-mail-change action sends was not verified.
- `error.ftl` shows the canvas's fixed sentences; Keycloak's raw message is not
  shown except to pick the blocked-cookie variant. `login-page-expired` offers one
  button (restart); Keycloak's "continue" link (resubmit the stale form) is dropped.
- The "Remember me" box stays supported but the realm has it off, so it is not on
  the canvas screen.

## Verified

- `pnpm nx run-many -t typecheck|lint|module-boundaries|build|test --skip-nx-cache`:
  see the PR; counts are read from the command output.
- Unit: `libs/ui/test/giris.spec.tsx` (rules, field, forms, validation stops the
  submit), `apps/keycloak-theme/test/giris-pages.spec.tsx` (adapters, link
  priority, profile attributes), and the existing `pages.spec.tsx`,
  `i18n.spec.ts`, `privacy-notice.spec.tsx` (updated for the new markup; the
  `Medaris` wordmark is exempt from the "no shared copy" and "no Latin in Arabic" checks;
  `logout-confirm.ftl` joined the list of pages).
- Browser (`pnpm nx run keycloak-theme:test:e2e`, 14 tests, Chromium): empty
  login stopped by the browser, filled login posts `username`/`password`, reveal
  button, error Alert keeps the user name, 390 px has no horizontal scroll, live
  rules, register stopped with reasons under the fields and focus on the first,
  register posts every field including `privacyNoticeRead=yes`, notice link
  `target=_blank`, info/17/error/expired/logout pages.
- Visual: login at 1440 and register at 1440 against `ekran.png` (register page
  height is identical, 1087 px); update-password, info, error and logout read
  against their canvases. Login at 390 px was rendered and read, not pixel-compared.

## Not verified

- **No real Keycloak.** The e2e renders the theme through Storybook. A POST to
  `url.loginAction` / `registrationAction`, a real wrong password, the realm's
  server-side checks and the real `messageHeader`s need the theme JAR built and
  deployed into a Keycloak; that was not done here. Acceptance criteria 01/2-3,
  03/4, 07/4 are therefore asserted at the request the browser sends, not at the
  identity provider.
- Night theme (`data-theme="dark"`) was not compared with the canvas.
- Arabic (RTL) was covered by the existing page specs (direction, field
  direction, no Latin copy) and not looked at in a browser.
- Update-password and logout in a browser at 390 px; the e-mail-link flows
  (SMTP).
- `biome-ratchet` reports 79 warnings against a baseline of 74; the same check
  on the base commit reports 81, so the gap predates this change (this change
  removes two).
