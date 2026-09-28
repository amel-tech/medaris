import * as React from 'react';

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** the glyph, normally <Icon name="…" size="sm" /> passed by the caller */
  icon: React.ReactNode;
  /** required: the accessible name, also shown as the tooltip. An icon-only control has no name without it */
  label: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
  size?: 'mini' | 'small' | 'regular' | 'large';
}
export declare function IconButton(props: IconButtonProps): JSX.Element;
