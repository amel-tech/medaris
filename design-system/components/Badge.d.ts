import * as React from 'react';

export type BadgeVariant =
  | 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive'
  | 'success' | 'warning' | 'info';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: React.ReactNode;
}
export declare function Badge(props: BadgeProps): JSX.Element;
