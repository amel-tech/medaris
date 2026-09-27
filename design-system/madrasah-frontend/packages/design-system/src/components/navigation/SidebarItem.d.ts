import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export interface SidebarItemProps extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  /** Leading <Icon />, 19px. */
  icon?: ReactNode;
  label: string;
  /** Fills with --nav-active and bumps to weight 600. @default false */
  active?: boolean;
  /** Right-aligned slot — a count or lock icon. */
  trailing?: ReactNode;
  /** Icon-only 42px square, for the narrow rail layout. @default false */
  collapsed?: boolean;
  style?: CSSProperties;
}

/** Sidebar / rail navigation row. Active state is a filled tint, never a colored bar. */
export declare function SidebarItem(props: SidebarItemProps): JSX.Element;
