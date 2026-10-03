import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

/**
 * @startingPoint section="Core" subtitle="Hairline container with optional media and footer" viewport="700x210"
 */
export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  /** Drives hairline color and padding scale. @default "tedris" */
  app?: "tedris" | "nizam";
  /** Adds pointer cursor + hover transition. @default false */
  interactive?: boolean;
  /** Override body padding. */
  pad?: number | string;
  /** Full-bleed top slot — usually a <CoverPattern />. */
  media?: ReactNode;
  /** Divider-separated bottom slot for meta rows. */
  footer?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
}

/** The default container: hairline border, 14px radius, white fill, NO shadow. */
export declare function Card(props: CardProps): JSX.Element;
