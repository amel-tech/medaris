import * as React from 'react';

export interface NavSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  /** the group's label in sentence case; CSS uppercases it under lang="tr" */
  children: React.ReactNode;
}
export declare function NavSection(props: NavSectionProps): JSX.Element;
