import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export type BreadcrumbItem = string | { label: string; href?: string };

export interface BreadcrumbProps extends HTMLAttributes<HTMLElement> {
  /** root first; the last item is the current page and never a link */
  items?: BreadcrumbItem[];
  label?: string;
}

/**
 * `.mds-breadcrumb`: where the URL already is. Below 768 only the parent shows,
 * as a back link. With no parent there is nothing to show, so no landmark.
 */
export function Breadcrumb({
  items = [],
  label = "Sayfa yolu",
  className,
  ...rest
}: BreadcrumbProps) {
  if (items.length < 2) return null;
  const last = items.length - 1;
  return (
    <nav
      className={cx("mds-breadcrumb", className)}
      aria-label={label}
      {...rest}
    >
      <ol className="mds-breadcrumb__list">
        {items.map((item, i) => {
          const { label: text, href } =
            typeof item === "string" ? { label: item, href: undefined } : item;
          let node: React.ReactNode;
          if (i === last) {
            node = (
              <span className="mds-breadcrumb__current" aria-current="page">
                <bdi>{text}</bdi>
              </span>
            );
          } else if (href) {
            node = (
              <a className="mds-breadcrumb__link" href={href}>
                {i === last - 1 ? (
                  <span className="mds-breadcrumb__back" aria-hidden="true" />
                ) : null}
                <bdi>{text}</bdi>
              </a>
            );
          } else {
            node = (
              <span className="mds-breadcrumb__text">
                <bdi>{text}</bdi>
              </span>
            );
          }
          return (
            <li key={i} className="mds-breadcrumb__item">
              {node}
              {i < last ? (
                <span className="mds-breadcrumb__sep" aria-hidden="true">
                  /
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
