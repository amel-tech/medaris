import * as React from 'react';

export interface ToasterProps extends React.HTMLAttributes<HTMLElement> {
  /** the name of its region landmark; default "Bildirimler" */
  label?: string;
  /** the current Toasts, oldest first; the newest three show */
  children?: React.ReactNode;
  className?: string;
}
export declare function Toaster(props: ToasterProps): JSX.Element;
