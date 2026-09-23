import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style"> {
  /** The <Icon /> to render. */
  icon: ReactNode;
  /** Required accessible label — these buttons have no visible text. */
  label: string;
  /** ghost = white + hairline (table row actions). bare = borderless (inline (…) menus).
   *  solid = dark filled (the "+" in a list-column header). @default "ghost" */
  variant?: "ghost" | "bare" | "solid";
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  style?: CSSProperties;
}

/** Square icon-only action. Always pass label. */
export declare function IconButton(props: IconButtonProps): JSX.Element;
