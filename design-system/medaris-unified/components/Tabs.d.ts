import * as React from 'react';

export interface TabsProps {
  tabs: TabsTab[];
  /** the selected tab (tabs) or the current page (links) */
  value: string;
  /** tabs mode: called with a tab's value on click and on the arrow keys, Home and End */
  onChange?: TabsChangeHandler;
  /** required: the tab set's accessible name, on role="tablist" or on the <nav> */
  label: string;
  /** ids: tab `${idBase}-tab-${value}`, panel `${idBase}-panel-${value}` */
  idBase: string;
  /** links = the panels are different pages: a <nav> of links with aria-current="page", no tab roles */
  mode?: 'tabs' | 'links';
  /** the counts' locale; default the nearest lang, then tr-TR */
  locale?: string;
  className?: string;
}
export interface TabsTab {
  /** id-safe: it is part of the tab's and the panel's id */
  value: string;
  label: React.ReactNode;
  /** a count after the label, in the page's locale */
  count?: number;
  /** links mode: the page this tab opens */
  href?: string;
}
export type TabsChangeHandler = (value: string) => void;
export declare function Tabs(props: TabsProps): JSX.Element;
