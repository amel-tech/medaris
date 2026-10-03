"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Draws its children unless the layout's active child segment is `segment`.
 * The course layout's chrome steps aside under `lessons`, whose own layout
 * draws the bar with the celse's title.
 */
export function HideUnderSegment({
  segment,
  children,
}: {
  segment: string;
  children: ReactNode;
}) {
  return useSelectedLayoutSegment() === segment ? null : children;
}
