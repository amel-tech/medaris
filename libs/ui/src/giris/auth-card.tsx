import type { ReactNode } from "react";
import { Logo } from "../mds/logo";

export interface AuthCardProps {
  /** the page's one `<h1>` */
  title: ReactNode;
  /** under the title, inside the header */
  subtitle?: ReactNode;
  /** a page-state `Alert`, between the header and the body */
  alert?: ReactNode;
  /** the body: a form, or the paragraphs and the one action of a state page */
  children?: ReactNode;
  /** after a separator, small: "Hesabın yok mu? Kayıt ol" */
  footer?: ReactNode;
  /** the `id` of the heading, so a page can name itself */
  titleId?: string;
}

/**
 * The one card every sign-in page sits on (canvas medaris/01..14: `.ekran-giris`
 * and `.ekran-giris__kart`, which were the prototype's and became this
 * component, canvas rule 36). Logo and title at the top, the body under them,
 * a quiet footer. Below 768 the card drops its border and ground and the page
 * starts at the top instead of centring. It is the page's `<main>`.
 *
 * It knows nothing of the identity provider: every string and every node
 * arrives as a prop (canvas rule 44).
 */
export function AuthCard({
  title,
  subtitle,
  alert,
  children,
  footer,
  titleId = "kc-page-title",
}: AuthCardProps) {
  return (
    <main
      aria-labelledby={titleId}
      className="grid min-block-screen content-center place-items-center gap-y-5 py-8 px-gutter max-md:items-start"
    >
      <div className="flex inline-full max-inline-[440px] flex-col gap-6 rounded-surface border border-neutral-subtle bg-neutral-surface p-8 max-md:border-0 max-md:bg-transparent max-md:p-5">
        <div className="flex flex-col items-start gap-4">
          <Logo size="lg" wordmark arabic={false} />
          <div className="flex flex-col gap-2">
            <h1 className="mds-h2" id={titleId}>
              {title}
            </h1>
            {subtitle ? <p className="mds-body">{subtitle}</p> : null}
          </div>
        </div>
        {alert}
        {children}
        {footer ? (
          <>
            <hr className="mds-separator" />
            <div className="mds-body-sm">{footer}</div>
          </>
        ) : null}
      </div>
    </main>
  );
}
