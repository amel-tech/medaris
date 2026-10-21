"use client";

import { Icon } from "@medaris/ui/mds/icon";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { liveChatPopoutUrlOf, liveChatUrlOf } from "../recordings-model";

/**
 * Whether the page is dark, by the rule of `@medaris/tokens`: `data-theme` on
 * `<html>` wins, and without it the system preference decides.
 */
export const pageIsDark = (): boolean => {
  const forced = document.documentElement.dataset.theme;
  if (forced === "dark") return true;
  if (forced === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

const subscribeTheme = (onChange: () => void) => {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => {
    media.removeEventListener("change", onChange);
    observer.disconnect();
  };
};

/**
 * YouTube's live chat of a stream on air (MDRS-229), the "Canlı sohbet" panel
 * of the watch page (MDRS-285). It is open from the start at every width, the
 * phone's tab included: on the watch page it is what the panel is for, so
 * nothing is left to unfold. The card takes the height its parent gives it and
 * its frame takes what the header leaves, at least 15rem. Only the header is
 * inset; the frame runs to the card's start, end and bottom edges (MDRS-297).
 *
 * The frame mounts in the browser only (its `embed_domain` is this page's
 * host) and follows the page's theme. Its look inside is YouTube's; writing
 * needs a YouTube sign-in the frame can see, which many browsers keep out of
 * a frame on another site, so the header carries "YouTube'da aç": the same
 * chat as YouTube's own page, in a new tab, as in the wireframe.
 */
export function LiveChat({
  streamUrl,
  className,
}: {
  streamUrl: string;
  /** Classes for the card, to size it in the page's layout. */
  className?: string;
}) {
  const t = useTranslations("tedris.SessionPage");
  const titleId = useId();
  const dark = useSyncExternalStore(subscribeTheme, pageIsDark, () => false);
  const [host, setHost] = useState<string | null>(null);

  useEffect(() => {
    setHost(window.location.hostname);
  }, []);

  const src = host ? liveChatUrlOf(streamUrl, { host, dark }) : null;
  const popout = liveChatPopoutUrlOf(streamUrl);

  return (
    <section
      className={`mds-card flex flex-col overflow-hidden p-0${className ? ` ${className}` : ""}`}
      aria-labelledby={titleId}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-(--space-inset-card) pt-(--space-inset-card) pb-3">
        <h2 className="mds-h3 flex items-center gap-2" id={titleId}>
          <Icon name="chat" />
          {t("liveChatTitle")}
        </h2>
        {popout ? (
          <a
            className="mds-btn mds-btn--link ms-auto inline-flex items-center gap-1"
            href={popout}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("liveChatPopout")}
            <span className="mds-visually-hidden"> {t("liveChatNewTab")}</span>
            <Icon name="externalLink" size="sm" />
          </a>
        ) : null}
      </div>
      {/* The frame's place is kept before it mounts, so the panel does not jump. */}
      <div className="flex min-block-[15rem] flex-1 flex-col">
        {src ? (
          <iframe
            // A new address (the theme changed) is a new frame.
            key={src}
            className="block inline-full flex-1 border-0"
            src={src}
            title={t("liveChatTitle")}
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
          />
        ) : null}
      </div>
    </section>
  );
}
