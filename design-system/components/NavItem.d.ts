import * as React from 'react';

export interface NavItemProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  icon?: React.ReactNode;
  active?: boolean;
}
export declare function NavItem(props: NavItemProps): JSX.Element;
export declare function NavSection(props: { children: React.ReactNode }): JSX.Element;
