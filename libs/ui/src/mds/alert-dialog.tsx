import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import { type ReactNode, useRef } from "react";
import { Button, type ButtonVariant } from "./button";
import { cx } from "./cx";

export interface AlertDialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  eyebrow?: ReactNode;
  title: ReactNode;
  /** "{Ad} {kimlerden} gizlenecek; {etkisi}." and the way back */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /** Gizle is not destructive: a primary button after a ghost "Vazgeç" */
  confirmVariant?: ButtonVariant;
  /** stays disabled until the answer is valid (a chosen radio, a typed reason) */
  confirmDisabled?: boolean;
  /** the confirm button's busy state while the call runs */
  confirmLoading?: boolean;
  closeLabel?: string;
  trigger?: ReactNode;
  className?: string;
}

/**
 * A confirmation that waits for an answer (canvas rule 11): `role="alertdialog"`,
 * never closed by the scrim, focus starts on "Vazgeç" (rule 13), and the
 * footer order is the focus rule: ghost "Vazgeç" first, then the one action.
 * Base UI's AlertDialog.
 */
export function AlertDialog({
  open,
  defaultOpen,
  onOpenChange,
  eyebrow,
  title,
  children,
  confirmLabel,
  cancelLabel = "Vazgeç",
  onConfirm,
  confirmVariant = "primary",
  confirmDisabled = false,
  confirmLoading,
  closeLabel = "Kapat",
  trigger,
  className,
}: AlertDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <BaseAlertDialog.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={(next) => onOpenChange?.(next)}
    >
      {trigger}
      <BaseAlertDialog.Portal>
        <BaseAlertDialog.Backdrop className="mds-scrim" />
        <BaseAlertDialog.Viewport className="mds-dialog-viewport">
          <BaseAlertDialog.Popup
            className={cx("mds-dialog", className)}
            initialFocus={cancel}
          >
            <div className="mds-dialog__panel">
              <div className="mds-dialog__header">
                <div className="mds-dialog__heading">
                  {eyebrow ? (
                    <p className="mds-eyebrow" dir="auto">
                      {eyebrow}
                    </p>
                  ) : null}
                  <BaseAlertDialog.Title
                    className="mds-dialog__title"
                    dir="auto"
                  >
                    {title}
                  </BaseAlertDialog.Title>
                </div>
                <div className="mds-dialog__actions">
                  <BaseAlertDialog.Close
                    className="mds-btn mds-icon-btn mds-btn--small mds-btn--ghost mds-dialog__close"
                    aria-label={closeLabel}
                  />
                </div>
              </div>
              <BaseAlertDialog.Description
                className="mds-dialog__body"
                render={<div />}
              >
                {children}
              </BaseAlertDialog.Description>
              <div className="mds-dialog__footer">
                <BaseAlertDialog.Close
                  ref={cancel}
                  className="mds-btn mds-btn--regular mds-btn--ghost"
                >
                  {cancelLabel}
                </BaseAlertDialog.Close>
                <Button
                  variant={confirmVariant}
                  disabled={confirmDisabled}
                  loading={confirmLoading}
                  onClick={onConfirm}
                >
                  {confirmLabel}
                </Button>
              </div>
            </div>
          </BaseAlertDialog.Popup>
        </BaseAlertDialog.Viewport>
      </BaseAlertDialog.Portal>
    </BaseAlertDialog.Root>
  );
}

/** The opener of an `AlertDialog`: a Base UI trigger rendered as the element you pass. */
export function AlertDialogTrigger({
  children,
}: {
  children: React.ReactElement;
}) {
  return <BaseAlertDialog.Trigger render={children} />;
}
