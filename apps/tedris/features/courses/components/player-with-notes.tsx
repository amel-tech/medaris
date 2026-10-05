import type { ReactNode } from "react";

/**
 * A video and the talebe's notes on it, as the recordings tab and the session
 * page lay them out (MDRS-280): the player first and at the full width of its
 * column, the notes under it. Only where the column itself is wide (64rem, a
 * container query on the column, not a guess from the viewport) do the notes
 * move beside the player; the course page and the session page keep their
 * main column narrower than that beside the aside, so there they stay under
 * it. Server-safe: no state, so it renders in both trees.
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
  <div className="@container" data-player-with-notes="">
    <div className="grid grid-cols-1 items-start gap-4 @min-[64rem]:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      {player}
      {notes}
    </div>
  </div>
);
