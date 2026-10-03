import type { CSSProperties } from "react";
import { cx } from "./cx";

export interface SkeletonProps {
  /** a CSS length, read by the class layer as `--mds-skeleton-w` */
  width?: string;
  height?: string;
  className?: string;
}

/** One `.mds-skeleton` bar, always hidden from assistive technology. */
export function Skeleton({ width, height, className }: SkeletonProps) {
  const vars: Record<string, string> = {};
  if (width != null) vars["--mds-skeleton-w"] = width;
  if (height != null) vars["--mds-skeleton-h"] = height;
  return (
    <div
      className={cx("mds-skeleton", className)}
      style={vars as CSSProperties}
      aria-hidden="true"
    />
  );
}
