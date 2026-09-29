import * as React from 'react';

export declare function initials(name?: string): string;

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  name?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
}
export declare function Avatar(props: AvatarProps): JSX.Element;

export interface AvatarStackProps {
  people: Array<{ name?: string; src?: string }>;
  max?: number;
}
export declare function AvatarStack(props: AvatarStackProps): JSX.Element;
