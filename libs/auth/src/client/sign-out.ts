import { AUTH_ROUTES } from "../shared/routes";

/**
 * Signs out of this app and of the IdP: a top-level form POST to
 * `/api/auth/signout`, which reads the ID token from the cookie, clears the
 * session and redirects to the IdP's end-session endpoint with
 * `id_token_hint` (B7, C7: the ID token no longer passes through the browser).
 *
 * A form rather than `fetch`: the answer is a redirect the whole tab must
 * follow to another origin. A POST rather than a link: signing out on a plain
 * GET would let any page log the visitor out.
 *
 * `locale` becomes `ui_locales` on the end-session request, so a page the IdP
 * shows in between is in the visitor's language (MDRS-222).
 */
export interface SignOutOptions {
  locale?: string;
}

export interface SignOutDeps {
  /** Builds and submits the form; replaced in the specs. */
  submit: (action: string, fields: Record<string, string>) => void;
}

const submitForm: SignOutDeps["submit"] = (action, fields) => {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  form.style.display = "none";
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
};

export function signOut(
  options: SignOutOptions = {},
  deps: SignOutDeps = { submit: submitForm }
): void {
  const fields: Record<string, string> = {};
  if (options.locale) fields.locale = options.locale;
  deps.submit(AUTH_ROUTES.signOut, fields);
}
