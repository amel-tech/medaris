export * from "./callback-url";
export * from "./end-instant";
export * from "./meeting-platform";
export * from "./privacy-notice";
export * from "./time-zone";
export * from "./youtube-live";

export const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
};

export const truncate = (text: string, length: number): string => {
  if (text.length <= length) return text;
  return text.slice(0, length) + "...";
};
