import type { ReactNode } from "react";

/**
 * A video and the talebe's notes on it, as the recordings tab and the session
 * page lay them out (MDRS-280): the player first, the notes under it, at every
 * width. The pages give this block their whole content width, so the video is
 * the largest thing on them. On a short window the block narrows, centred,
 * until a whole 16:9 frame fits the height under the top bar (with a margin
 * of 1.5rem above and below), so the player never needs scrolling to be seen
 * whole; `svh`, not `dvh`, so a phone's toolbars do not resize it as they
 * come and go. Server-safe: no state, so it renders in both trees.
 */
export const PlayerWithNotes = ({
  player,
  notes,
}: {
  /** The player card (`MediaPlayer`). */
  player: ReactNode;
  /** The notes panel, or nothing when the viewer takes no notes. */
  notes?: ReactNode;
}) => (
  <div
    className="mx-auto flex inline-full max-inline-[min(100%,calc((100svh_-_var(--layout-topbar)_-_var(--space-12))*16/9))] flex-col gap-4"
    data-player-with-notes=""
  >
    {player}
    {notes}
  </div>
);
