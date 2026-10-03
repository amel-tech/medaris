import * as React from 'react';

export interface SkeletonProps {
  /** a CSS length or percentage, the length of the line it stands in for. @default "100%" */
  width?: string;
  /** a CSS length, the height of the text it stands in for; prefer a token, var(--space-4). @default "12px" */
  height?: string;
  className?: string;
}
export declare function Skeleton(props: SkeletonProps): JSX.Element;
