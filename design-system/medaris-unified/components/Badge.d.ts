import * as React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'brand' | 'live' | 'success' | 'warning' | 'info';
  /** a glyph before the label, normally <Icon name="…" size="sm" /> passed by the caller */
  icon?: React.ReactNode;
  /** the 8px dot in currentColor, aria-hidden, before the label; variant="live" always draws it */
  dot?: boolean;
}
export declare function Badge(props: BadgeProps): JSX.Element;
