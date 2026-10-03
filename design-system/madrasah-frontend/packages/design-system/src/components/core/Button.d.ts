import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

/**
 * @startingPoint section="Core" subtitle="Primary, create, ghost and link buttons" viewport="700x170"
 */
export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style"> {
  /** primary = dark, the default action in both apps. create = green, Nizam creation ONLY.
   *  ghost = white + hairline. quiet = borderless. link = inline text action. @default "primary" */
  variant?: "primary" | "create" | "danger" | "ghost" | "quiet" | "link";
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  /** Leading element, normally an <Icon />. */
  icon?: ReactNode;
  /** Trailing element, normally a chevron or arrow <Icon />. */
  iconAfter?: ReactNode;
  fullWidth?: boolean;
  disabled?: boolean;
  /** Render as another element, e.g. "a". @default "button" */
  as?: "button" | "a";
  children?: ReactNode;
  style?: CSSProperties;
}

/** Text action. Never use variant="create" outside a Nizam create flow. */
export declare function Button(props: ButtonProps): JSX.Element;
