import type { CSSProperties, ReactNode } from "react";

export interface DialogProps {
  /** @default true */
  open?: boolean;
  /** Called by the scrim and the close button. Omit to hide the close button. */
  onClose?: () => void;
  /** Uppercase micro-label above the title, e.g. "Tam Müfredat". */
  eyebrow?: string;
  title?: string;
  /** Extra header controls beside close, e.g. a "PDF olarak indir" button. */
  headerExtra?: ReactNode;
  /** Footer row. Use a spacer div to split left meta from right buttons. */
  actions?: ReactNode;
  /** Max width in px. @default 960 */
  width?: number;
  /** Scope the scrim to the nearest positioned ancestor instead of the viewport.
   *  Required inside canvas artboards and embedded previews. @default false */
  contained?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}

/** Centered modal with scrim + blur. Use contained inside fixed-size frames. */
export declare function Dialog(props: DialogProps): JSX.Element | null;
