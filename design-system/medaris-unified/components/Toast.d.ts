import * as React from 'react';

export interface ToastProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** default success; warning and error go to the Toaster's role="alert" region and never close themselves */
  tone?: 'success' | 'info' | 'warning' | 'error';
  /** what just happened, in one line; an author string inside it goes in bdi */
  title: React.ReactNode;
  /** one short sentence of detail */
  description?: React.ReactNode;
  /** one action, a mini ghost Button such as "Geri al"; the same action must exist elsewhere */
  action?: React.ReactNode;
  /** removes the toast: the close button, and the timer of a success or info toast (6 s, 10 s with an action) */
  onClose?: ToastCloseHandler;
  /** accessible name of the close button; default "Kapat" */
  closeLabel?: string;
  className?: string;
}
export type ToastCloseHandler = () => void;
export declare function Toast(props: ToastProps): JSX.Element;
