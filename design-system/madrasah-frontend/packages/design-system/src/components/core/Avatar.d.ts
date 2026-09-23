import type { CSSProperties, HTMLAttributes } from "react";

export interface AvatarProps extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  /** Two-letter initials, e.g. "AH". @default "MD" */
  initials?: string;
  /** oklch hue for a per-person tint. Omit for the neutral gray ground. */
  hue?: number;
  /** @default 32 */
  size?: number;
  /** circle in Tedris, square in Nizam sidebars/tables. @default "circle" */
  shape?: "circle" | "square";
  /** White ring, so overlapping stacks separate. Circles only. @default true */
  ring?: boolean;
  style?: CSSProperties;
}

export interface AvatarStackProps {
  people: Array<{ initials: string; hue?: number }>;
  /** @default 30 */
  size?: number;
  /** Faces shown before the +N chip. @default 5 */
  max?: number;
  /** Override the +N count. */
  overflow?: number;
  style?: CSSProperties;
}

/** Initials avatar — there are no photo avatars in this system. */
export declare function Avatar(props: AvatarProps): JSX.Element;
/** Overlapping row of avatars with a +N overflow chip. */
export declare function AvatarStack(props: AvatarStackProps): JSX.Element;
