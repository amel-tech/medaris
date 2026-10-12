/**
 * Where a popup anchored to a control opens (MDRS-289, the Müfredat
 * combobox at the foot of the celse detail page): below the control when it
 * fits there, otherwise above it when it fits there; when it fits on
 * neither side, on the side with more room. `room` is the height the popup
 * may take on that side, so a list inside it scrolls instead of leaving the
 * window. Pure: the component measures the rects when the popup opens, and
 * again on resize and scroll while it is open.
 */

export type PopupSide = "below" | "above";

export interface PopupPlacement {
  side: PopupSide;
  /** the most the popup may measure, in px, on that side */
  room: number;
}

export const placePopup = ({
  anchor,
  viewport,
  height,
  gap,
}: {
  /** the control's rect, in the window's coordinates */
  anchor: { top: number; bottom: number };
  /** the band the popup must stay in: the window, less a margin */
  viewport: { top: number; bottom: number };
  /** the popup's whole height, its list unclipped up to the list's own cap */
  height: number;
  /** the space between the control and the popup */
  gap: number;
}): PopupPlacement => {
  const below = viewport.bottom - anchor.bottom - gap;
  const above = anchor.top - viewport.top - gap;
  const side: PopupSide =
    below >= height
      ? "below"
      : above >= height || above > below
        ? "above"
        : "below";
  return {
    side,
    room: Math.max(0, Math.floor(side === "below" ? below : above)),
  };
};
