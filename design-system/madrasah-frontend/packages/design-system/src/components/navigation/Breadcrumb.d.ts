import type { CSSProperties } from "react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  /** Trail, root first. Plain strings are fine for non-links. */
  items: Array<string | BreadcrumbItem>;
  /** sm = 13px (Tedris page top), md = 15px (Nizam panel bar). @default "md" */
  size?: "sm" | "md";
  style?: CSSProperties;
}

/** Chevron-separated trail. The last item is the current page and is never a link. */
export declare function Breadcrumb(props: BreadcrumbProps): JSX.Element;
