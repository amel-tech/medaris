import type {
  AnchorHTMLAttributes,
  ComponentType,
  ElementType,
  ReactNode,
  Ref,
} from "react";
import { cx } from "./cx";
import { formatNumber, usePageLocale } from "./locale";

export interface NavItemProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  icon?: ReactNode;
  /** the viewer's page: `aria-current="page"` */
  active?: boolean;
  count?: number;
  /** read after the count by assistive technology ("bağlantısı eksik") */
  countLabel?: string;
  trailing?: ReactNode;
  locale?: string;
  /**
   * The element that draws the link, for an app whose router navigates on the
   * client (`next/link`): without it the item is a plain `<a>` and every
   * followed link is a full document load. It receives the item's own props.
   */
  linkComponent?: ComponentType<
    AnchorHTMLAttributes<HTMLAnchorElement> & {
      href: string;
      ref?: Ref<HTMLAnchorElement>;
    }
  >;
}

/** `.mds-nav-item`. A link, never a button: routing is by URL. The same item in the sidebar and in the AppBar's sheet. */
export function NavItem({
  href,
  icon,
  active = false,
  count,
  countLabel,
  trailing,
  locale,
  linkComponent,
  children,
  className,
  ...rest
}: NavItemProps) {
  const { ref, lang } = usePageLocale<HTMLAnchorElement>(locale);
  const Tag: ElementType = linkComponent ?? "a";
  return (
    <Tag
      ref={ref}
      className={cx("mds-nav-item", className)}
      href={href}
      aria-current={active ? "page" : undefined}
      {...rest}
    >
      {icon}
      {children}
      {count != null && count > 0 ? (
        <span className="mds-nav-item__count">
          {formatNumber(count, lang)}
          {countLabel ? (
            <span className="mds-visually-hidden"> {countLabel}</span>
          ) : null}
        </span>
      ) : null}
      {trailing ? (
        <span className="mds-nav-item__trailing">{trailing}</span>
      ) : null}
    </Tag>
  );
}
