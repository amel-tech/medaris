import { Dialog } from "@base-ui/react/dialog";
import { type ReactNode, useEffect, useState } from "react";
import { cx } from "./cx";

export interface AppBarProps {
  /** the page's name; isolated with `dir="auto"`, a course title may be Arabic */
  title: ReactNode;
  /** the `Logo` (size sm), passed by the caller */
  logo: ReactNode;
  /** at most two actions, each an `IconButton` with a label */
  actions?: ReactNode;
  /** the sheet's block-end: the signed-in person as `a.mds-nav-user`, the way to the account */
  footer?: ReactNode;
  /** the sheet's `NavSection`/`NavItem`s, the same as the desktop sidebar */
  children?: ReactNode;
  /** the scope picker (köşk, medrese), above the nav and outside it */
  scope?: ReactNode;
  menuLabel?: string;
  navLabel?: string;
  closeLabel?: string;
  className?: string;
}

/** `(min-width: 768px)` written out: `var()` cannot be used in a media query (MDS-LAY-04). */
const WIDE = "(min-width: 768px)";

/**
 * The compact chrome below 768 (canvas rule 18): a 56px bar with the menu button,
 * the mark, the page's name and at most two actions. The menu opens the nav
 * sheet, a Base UI Dialog. At 768 and up the bar is not drawn (CSS) and an open
 * sheet closes. "Çıkış yap" is not in the sheet.
 */
export function AppBar({
  title,
  logo,
  actions,
  footer,
  scope,
  children,
  menuLabel = "Menü",
  navLabel = "Ana menü",
  closeLabel = "Kapat",
  className,
}: AppBarProps) {
  const [open, setOpen] = useState(false);

  // Widening the window past 767px closes the sheet.
  useEffect(() => {
    if (!open || typeof window === "undefined" || !window.matchMedia)
      return undefined;
    const mq = window.matchMedia(WIDE);
    const close = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener("change", close);
    return () => mq.removeEventListener("change", close);
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <header className={cx("mds-appbar", className)}>
        <Dialog.Trigger
          className="mds-btn mds-icon-btn mds-btn--large mds-btn--ghost mds-appbar__menu"
          aria-label={menuLabel}
        >
          <span className="mds-appbar__menu-icon" aria-hidden="true" />
        </Dialog.Trigger>
        {logo}
        <p className="mds-appbar__title" dir="auto">
          {title}
        </p>
        {actions ? <div className="mds-appbar__actions">{actions}</div> : null}
      </header>
      <Dialog.Portal>
        <Dialog.Backdrop className="mds-scrim" />
        <Dialog.Popup className="mds-sheet" aria-label={navLabel}>
          <div className="mds-sheet__body">
            <div className="mds-sheet__head">
              {logo}
              <Dialog.Close
                className="mds-btn mds-icon-btn mds-btn--regular mds-btn--ghost mds-sheet__close"
                aria-label={closeLabel}
              >
                <span className="mds-sheet__close-icon" aria-hidden="true" />
              </Dialog.Close>
            </div>
            {scope}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: delegated; a link followed by key or mouse bubbles a click, and the nav is a landmark, not a control */}
            <nav
              aria-label={navLabel}
              onClick={(event) => {
                // A followed link closes the sheet: the next page opens beneath it.
                if (
                  !event.defaultPrevented &&
                  (event.target as Element).closest("a[href]")
                )
                  setOpen(false);
              }}
            >
              {children}
            </nav>
            {footer ? <div className="mds-sheet__foot">{footer}</div> : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
