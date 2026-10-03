import type { LooseTranslator } from "~/lib/i18n/loose";
import type {
  CalendarLabels,
  SessionJoinLabels,
} from "./components/session-join-live";

// Narrow on purpose: the full translator type hits TS2589 (MDRS-176).
type Translate = LooseTranslator;

/** The join card's words, the same on the session page and on Ana sayfa (`t` is the `tedris` namespace). */
export const sessionJoinLabels = (t: Translate): SessionJoinLabels => ({
  label: t("SessionPage.joinLabel"),
  liveLabel: t("SessionPage.liveLabel"),
  endedLabel: t("SessionPage.endedLabel"),
  cancelledLabel: t("SessionPage.cancelledLabel"),
  cancelledText: t("SessionPage.cancelledJoinText"),
  noLinkText: t("SessionPage.noLinkText"),
  joinOpensText: t("SessionPage.joinOpensText", { minutes: "{minutes}" }),
  joinLabel: t("SessionPage.joinAction"),
  newTabLabel: t("SessionPage.newTab"),
  revealLabel: t("SessionPage.reveal"),
  localTimeLabel: t("SessionPage.localTime"),
  minuteUnit: t("SessionPage.minuteUnit"),
  recordingsLabel: t("SessionPage.recordingsGo"),
  elapsedText: t("SessionPage.elapsed", { minutes: "{minutes}" }),
});

/** "Takvime ekle" and its menu. */
export const calendarLabels = (t: Translate): CalendarLabels => ({
  button: t("AddToCalendar.button"),
  google: t("AddToCalendar.google"),
  apple: t("AddToCalendar.apple"),
  downloadFailed: t("AddToCalendar.downloadFailed"),
  subscribe: t("AddToCalendar.subscribe"),
  note: t("AddToCalendar.note"),
  linkIsOnPage: t("AddToCalendar.linkIsOnPage"),
});

/** The host a meeting link points at, for the chip of an unknown platform. */
export const hostOf = (url: string): string | undefined => {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname;
  } catch {
    return undefined;
  }
};
