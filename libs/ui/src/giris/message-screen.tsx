import type { ReactNode } from "react";
import { Button } from "../mds/button";

export interface AuthMessageProps {
  /** one `<p class="mds-body">` each */
  paragraphs: ReactNode[];
  /** the one way on: a full-width primary link */
  action?: { href: string; label: ReactNode; id?: string };
}

/**
 * The body of a page that only says something and offers one way on
 * (canvas medaris/05, 12, 13, 17): the paragraphs, then the primary link. It
 * is a link and not a button because it goes somewhere (canvas rule 10).
 */
export function AuthMessage({ paragraphs, action }: AuthMessageProps) {
  return (
    <>
      {paragraphs.length > 0 ? (
        <div className="flex flex-col gap-stack">
          {paragraphs.map((paragraph, index) => (
            <p key={index} className="mds-body">
              {paragraph}
            </p>
          ))}
        </div>
      ) : null}
      {action ? (
        <Button href={action.href} id={action.id} size="large" fullWidth>
          {action.label}
        </Button>
      ) : null}
    </>
  );
}

export interface LogoutConfirmFormProps {
  /** where "Çıkış yap" posts */
  action: string;
  confirmLabel: ReactNode;
  /** the confirm button's `name`: the provider reads it */
  confirmName?: string;
  /** the one-time code the provider needs back */
  sessionCode?: { name: string; value: string };
  cancel?: { href: string; label: ReactNode };
}

/**
 * The sign-out confirmation (canvas medaris/14), the fallback page: the app
 * signs out with a token hint and never lands here. A native POST with the
 * confirm button, and a ghost link that goes back.
 */
export function LogoutConfirmForm({
  action,
  confirmLabel,
  confirmName = "confirmLogout",
  sessionCode,
  cancel,
}: LogoutConfirmFormProps) {
  return (
    <form id="kc-logout-confirm" method="post" action={action}>
      {sessionCode ? (
        <input
          type="hidden"
          name={sessionCode.name}
          value={sessionCode.value}
        />
      ) : null}
      <div className="flex flex-col gap-2">
        <button
          type="submit"
          id="kc-logout"
          name={confirmName}
          className="mds-btn mds-btn--large mds-btn--primary mds-btn--full"
        >
          {confirmLabel}
        </button>
        {cancel ? (
          <a
            id="kc-cancel-logout"
            className="mds-btn mds-btn--large mds-btn--ghost mds-btn--full"
            href={cancel.href}
          >
            {cancel.label}
          </a>
        ) : null}
      </div>
    </form>
  );
}
