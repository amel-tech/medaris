import { type ReactNode, useId } from "react";

export interface ConsentFormProps {
  /** where both buttons post */
  action: string;
  /** the one-time code the provider needs back */
  code: { name: string; value: string };
  /** the sentence over the list: "Örnek Uygulama, Medaris hesabından şunları görecek:" */
  lead: ReactNode;
  /** what the app asks for, one line each ("E-posta adresin"), by the scope's own id */
  scopes: { id: string; text: ReactNode }[];
  /** the app's own terms and privacy policy, when it published them */
  links?: {
    intro: ReactNode;
    items: { href: string; label: ReactNode }[];
    /** read after each link, which opens in a new tab */
    newTabNote: ReactNode;
  };
  /** the buttons' `name`s are the provider's: it reads which one was pressed */
  accept: { name: string; label: ReactNode };
  cancel: { name: string; label: ReactNode };
}

/**
 * The consent page of an app that signs in with Medaris (Keycloak's
 * `login-oauth-grant.ftl`). What the app will see, as a plain list under one
 * sentence; then the app's own terms when it has them; then the two answers,
 * both native submits of one form, so the page works without script. "İzin
 * ver" is the primary button, "Vazgeç" the ghost one under it, as on the
 * sign-out confirmation (canvas medaris/14).
 */
export function ConsentForm({
  action,
  code,
  lead,
  scopes,
  links,
  accept,
  cancel,
}: ConsentFormProps) {
  const uid = useId().replace(/[^\w-]/g, "");
  const leadId = `${uid}-lead`;
  const noteId = `${uid}-new-tab`;
  return (
    <form
      id="kc-oauth"
      method="post"
      action={action}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name={code.name} value={code.value} />
      <div className="flex flex-col gap-3">
        <p className="mds-body" id={leadId}>
          {lead}
        </p>
        <ul
          aria-labelledby={leadId}
          className="m-0 flex list-none flex-col rounded-control border border-neutral-subtle p-0"
        >
          {scopes.map((scope) => (
            <li
              key={scope.id}
              className="mds-body-sm border-b border-neutral-subtle px-4 py-3 last:border-b-0"
            >
              {scope.text}
            </li>
          ))}
        </ul>
      </div>
      {links && links.items.length > 0 ? (
        <p className="mds-caption">
          {links.intro}{" "}
          {links.items.map((link, index) => (
            <span key={link.href}>
              {index > 0 ? " · " : null}
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-describedby={noteId}
              >
                {link.label}
              </a>
            </span>
          ))}
          <span className="mds-visually-hidden" id={noteId}>
            {links.newTabNote}
          </span>
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <button
          type="submit"
          id="kc-login"
          name={accept.name}
          className="mds-btn mds-btn--large mds-btn--primary mds-btn--full"
        >
          {accept.label}
        </button>
        <button
          type="submit"
          id="kc-cancel"
          name={cancel.name}
          className="mds-btn mds-btn--large mds-btn--ghost mds-btn--full"
        >
          {cancel.label}
        </button>
      </div>
    </form>
  );
}
