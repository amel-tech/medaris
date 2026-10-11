/**
 * How a talebe attends a celse that has no meeting link (MDRS-283): a live
 * stream, the celse being held in person, both, or nothing yet. A stream or
 * the in-person mark covers a celse as a link does, so none of these says
 * "the link has not been added" where one of them is there.
 *
 * The join card words it itself (the kit's `SessionJoin` takes the five
 * sentences); Programım, Ana sayfa and the course page's card read the
 * sentence from `SchedulePage.<key>`, which points to the session page
 * instead of "here".
 */
export type WithoutLinkKey =
  | "noLink"
  | "inPerson"
  | "stream"
  | "streamLive"
  | "inPersonStream"
  | "inPersonStreamLive";

export interface Attended {
  /** the session's own mark, else the course's; absent for a caller who may not read it */
  inPerson?: boolean | null;
  /** a stream is set; absent for a caller who may not read it */
  hasLiveStream?: boolean | null;
}

/** The sentence for a celse without a link; `live` while it runs, when a stream is on now. */
export const withoutLinkKey = (
  session: Attended,
  live: boolean
): WithoutLinkKey => {
  if (session.inPerson && session.hasLiveStream)
    return live ? "inPersonStreamLive" : "inPersonStream";
  if (session.hasLiveStream) return live ? "streamLive" : "stream";
  if (session.inPerson) return "inPerson";
  return "noLink";
};
