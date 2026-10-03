import * as React from 'react';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** one sentence about what is missing, in the surface's register */
  children: React.ReactNode;
  /** an Icon at size lg, passed by the caller */
  icon?: React.ReactNode;
  /** at most one action, and only one this viewer can take */
  action?: React.ReactNode;
  className?: string;
}
export declare function EmptyState(props: EmptyStateProps): JSX.Element;
