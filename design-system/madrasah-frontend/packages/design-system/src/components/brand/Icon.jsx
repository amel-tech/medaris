import React from "react";

/** The one line-icon set: stroke currentColor, 1.6 weight, round caps, 24x24 box. */
const PATHS = {
  search: "M18 18l-3.5-3.5M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9Zm4 13a2 2 0 0 0 4 0",
  globe: "M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z",
  home: "M4 11.5 12 4l8 7.5M6 10v9h12v-9M10 19v-5h4v5",
  book: "M4 4h12a4 4 0 0 1 4 4v13H8a4 4 0 0 1-4-4V4Zm0 0v13a4 4 0 0 1 4-4h12",
  table: "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Zm0 3h16M10 10v9",
  sidebar: "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Zm6-2v14",
  users: "M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M9 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7ZM17 14c2.8 0 5 2.2 5 5M17 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z",
  calendar: "M3.5 10h17M8 3v4M16 3v4M5.5 5h13a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  clock: "M12 7v5l3 2M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z",
  headset: "M3 14v-2a9 9 0 1 1 18 0v2m-3 6h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2v8Zm-12 0h2v-8H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2Z",
  pdf: "M7 3h7l4 4v14H7V3Zm7 0v4h4",
  doc: "M7 3h7l4 4v14H7V3Zm7 0v4h4M10 13h6M10 17h4",
  quiz: "M12 17v.5M9.5 9.5a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.1.9-1.1 1.7v.5M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z",
  playCircle: "M10 8.5v7l6-3.5-6-3.5ZM12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z",
  check: "m5 12 5 5L20 6",
  close: "m6 6 12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M9 7V4h6v3m-7 0v13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Zm10-3a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z",
  link: "M10 14a4 4 0 0 1 0-5.7l2.8-2.8a4 4 0 1 1 5.7 5.7L17 12.7m-3-2.7a4 4 0 0 1 0 5.7L11.3 18.5a4 4 0 1 1-5.7-5.7L7 11.4",
  download: "M12 4v12m0 0-4-4m4 4 4-4M5 20h14",
  upload: "M12 16V4m0 0-4 4m4-4 4 4M5 20h14",
  share: "m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6M6 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM18 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM18 15.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 21l1.6-4.4A8 8 0 1 1 21 12Z",
  filter: "M4 5h16l-6 8v6l-4-2v-4L4 5Z",
  settings: "M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.9l.1-.1A1.7 1.7 0 0 0 3.1 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.5l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z",
  certificate: "M12 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm-3 9-2 7 5-3 5 3-2-7",
  shield: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z",
  lock: "M8 10V7a4 4 0 1 1 8 0v3M6 10h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z",
  bookmark: "M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-3.5L6 21V4Z",
  chevronDown: "m6 9 6 6 6-6",
  chevronRight: "m9 6 6 6-6 6",
  chevronLeft: "m15 6-6 6 6 6",
  chevronsUpDown: "m8 9 4-4 4 4M8 15l4 4 4-4",
  arrowRight: "M5 12h14m-6-6 6 6-6 6",
  arrowLeft: "M19 12H5m6 6-6-6 6-6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

const FILLED = {
  star: "m12 3 2.7 5.7 6.3.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.3-.9L12 3Z",
  play: "M8 5v14l11-7L8 5Z",
};

export function Icon({ name, size = 18, filled = false, style, ...rest }) {
  const d = filled ? FILLED[name] : PATHS[name];
  if (!d) return null;
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block", flexShrink: 0, ...style }}
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}

export const ICON_NAMES = [...Object.keys(PATHS)];
export const FILLED_ICON_NAMES = [...Object.keys(FILLED)];
