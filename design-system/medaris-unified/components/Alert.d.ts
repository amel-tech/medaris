import * as React from 'react';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'info' | 'success' | 'warning' | 'error';
  title?: React.ReactNode;
}
export declare function Alert(props: AlertProps): JSX.Element;
