import * as React from 'react';

export interface BreadcrumbProps extends React.HTMLAttributes<HTMLElement> {
  /** root first; the last item is the current page and is never a link; fewer than two renders nothing */
  items: Array<string | BreadcrumbItem>;
  /** the nav's accessible name; default "Sayfa yolu" */
  label?: string;
}
export interface BreadcrumbItem {
  /** rendered in <bdi>: a köşk or course title may be Arabic */
  label: string;
  /** omit on the current page, and on a level that has no page of its own */
  href?: string;
}
export declare function Breadcrumb(props: BreadcrumbProps): JSX.Element | null;
