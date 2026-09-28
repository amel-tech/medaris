import * as React from 'react';

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** neutral explains or restricts, error reports a failed action, warning asks this reader to act, success confirms; info inherits SPEC-D3-03. @default "neutral" */
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'error';
  title?: React.ReactNode;
}
export declare function Alert(props: AlertProps): JSX.Element;
