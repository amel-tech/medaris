import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Form } from "@base-ui/react/form";
import {
  type FormEvent,
  type ReactNode,
  type Ref,
  type RefObject,
  useId,
  useRef,
} from "react";
import { cx } from "./cx";

export type DialogSize = "sm" | "md" | "lg";

export interface DialogShellProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** names what the dialog acts on, above the title */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** sm 440, md 640, lg 960 (lg is for reading, never for a form) */
  size?: DialogSize;
  /** controls beside the close button, never in the footer */
  headerActions?: ReactNode;
  footer?: ReactNode;
  footerMeta?: ReactNode;
  closeLabel?: string;
  /** the focus on open: a ref (the first field, or "Vazgeç"); else the first focusable */
  initialFocus?: RefObject<HTMLElement | null>;
  children?: ReactNode;
  className?: string;
}

export interface DialogProps extends DialogShellProps {
  /** a form dialog: the panel is a Base UI `Form` and the footer's submit sends it */
  form?: boolean;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  /** a click on the scrim closes it; default false for a form, true for a plain reader */
  dismissible?: boolean;
  /** the element a trigger opens it from */
  trigger?: ReactNode;
}

/**
 * A modal on Base UI's Dialog (canvas rules 11 to 17): `Portal > Backdrop.mds-scrim >
 * Viewport.mds-dialog-viewport > Popup.mds-dialog`. Focus is trapped, Esc closes
 * and focus returns to the opener, all Base UI's. A form dialog never closes on the
 * scrim, so typed input is not lost by a stray click. A confirmation that waits for
 * an answer is an `AlertDialog`.
 */
export function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  eyebrow,
  title,
  size = "sm",
  headerActions,
  footer,
  footerMeta,
  closeLabel = "Kapat",
  initialFocus,
  form = false,
  onSubmit,
  dismissible,
  trigger,
  children,
  className,
}: DialogProps) {
  const pointerDismiss = dismissible ?? !form;
  const panelClass = "mds-dialog__panel";
  const titleId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  // A reading window (lg, not a form) has no field: the scrollable body is the
  // focus stop, so the keyboard can scroll the text.
  const reader = size === "lg" && !form;
  const inner = (
    <>
      <div className="mds-dialog__header">
        <div className="mds-dialog__heading">
          {eyebrow ? (
            <p className="mds-eyebrow" dir="auto">
              {eyebrow}
            </p>
          ) : null}
          <BaseDialog.Title
            id={titleId}
            className="mds-dialog__title"
            dir="auto"
          >
            {title}
          </BaseDialog.Title>
        </div>
        <div className="mds-dialog__actions">
          {headerActions}
          <BaseDialog.Close
            className="mds-btn mds-icon-btn mds-btn--small mds-btn--ghost mds-dialog__close"
            aria-label={closeLabel}
          />
        </div>
      </div>
      <BaseDialog.Description
        ref={bodyRef}
        className="mds-dialog__body"
        render={<div />}
        {...(reader
          ? { role: "region", tabIndex: 0, "aria-labelledby": titleId }
          : {})}
      >
        {children}
      </BaseDialog.Description>
      {footer || footerMeta ? (
        <div className="mds-dialog__footer">
          {footerMeta ? <p className="mds-dialog__meta">{footerMeta}</p> : null}
          {footer}
        </div>
      ) : null}
    </>
  );
  return (
    <BaseDialog.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={(next) => onOpenChange?.(next)}
      disablePointerDismissal={!pointerDismiss}
    >
      {trigger}
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="mds-scrim" />
        <BaseDialog.Viewport className="mds-dialog-viewport">
          <BaseDialog.Popup
            className={cx(
              "mds-dialog",
              size !== "sm" && `mds-dialog--${size}`,
              className
            )}
            initialFocus={initialFocus ?? (reader ? bodyRef : undefined)}
          >
            {form ? (
              <Form className={panelClass} onSubmit={onSubmit}>
                {inner}
              </Form>
            ) : (
              <div className={panelClass}>{inner}</div>
            )}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

/** The opener: a Base UI trigger rendered as the element you pass (a `Button`). */
export function DialogTrigger({ children }: { children: React.ReactElement }) {
  return <BaseDialog.Trigger render={children} />;
}

/**
 * "Vazgeç": a ghost button that closes the nearest `Dialog` and never submits.
 * A `ref` lets a confirmation start its focus here (canvas rule 13).
 */
export function DialogClose({
  children = "Vazgeç",
  className,
  ref,
}: {
  children?: ReactNode;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <BaseDialog.Close
      ref={ref}
      className={cx("mds-btn mds-btn--regular mds-btn--ghost", className)}
    >
      {children}
    </BaseDialog.Close>
  );
}
