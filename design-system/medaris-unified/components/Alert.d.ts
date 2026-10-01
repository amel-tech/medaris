import * as React from 'react';

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** neutral explains or restricts, info reports news the reader need not act on, success confirms, warning asks this reader to act, error reports a failed action. @default "neutral" */
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'error';
  title?: React.ReactNode;
}
export declare function Alert(props: AlertProps): JSX.Element;
