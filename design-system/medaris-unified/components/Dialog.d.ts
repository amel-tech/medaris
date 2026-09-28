import * as React from 'react';

export interface DialogProps extends Omit<React.DialogHTMLAttributes<HTMLDialogElement>, 'title' | 'open' | 'onClose' | 'onCancel'> {
  /** true shows the dialog with showModal(); false closes it without calling onClose */
  open: boolean;
  /** called once per close, with the submitting footer button's value; "cancel" for Vazgeç, Esc, the close button and the backdrop */
  onClose: DialogCloseHandler;
  /** names the dialog (aria-labelledby); an author string inside it goes in bdi */
  title: React.ReactNode;
  /** a caption line above the title: the thing the dialog acts on */
  eyebrow?: string;
  /** alert: a confirmation — role="alertdialog", the backdrop does nothing, focus starts on the first footer button */
  kind?: 'dialog' | 'alert';
  /** 400 / 640 / 960; lg is for reading, never for a form */
  size?: 'sm' | 'md' | 'lg';
  /** beside the close button, never in the footer */
  headerActions?: React.ReactNode;
  /** the buttons: ghost "Vazgeç" first (type="button", value="cancel": the dialog closes itself with "cancel"), then the one action */
  footer?: React.ReactNode;
  /** a caption at the footer's inline start */
  footerMeta?: React.ReactNode;
  /** the panel is a form with method="dialog": a footer button's value becomes onClose's returnValue */
  form?: boolean;
  /** a backdrop click closes; default true for kind="dialog" without form, false otherwise */
  dismissible?: boolean;
  /** Esc was pressed; event.preventDefault() keeps the dialog open, to confirm leaving unsaved input */
  onCancel?: DialogCancelHandler;
  /** accessible name of the close button; default "Kapat" */
  closeLabel?: string;
  children?: React.ReactNode;
  className?: string;
}
export type DialogCloseHandler = (returnValue?: string) => void;
export type DialogCancelHandler = (event: React.SyntheticEvent<HTMLDialogElement>) => void;
export declare function Dialog(props: DialogProps): JSX.Element;
