"use client";

import { Icon } from "@medaris/ui/mds/icon";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { liveChatPopoutUrlOf, liveChatUrlOf } from "../recordings-model";

/** Open from this width up; below it the chat waits behind its summary. */
const WIDE = "(min-width: 768px)";

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
 * YouTube's live chat under the stream of a session on air (MDRS-229). A
 * disclosure card: open on a wide window, closed on a phone so the player and
 * "Celseye katıl" keep their place. The frame mounts only while open, in the
 * browser (its `embed_domain` is this page's host), and follows the page's
 * theme. Its look inside is YouTube's; writing needs a YouTube sign-in the
 * frame can see, which many browsers keep out of a frame on another site, so
 * under it "Sohbeti YouTube'da aç" opens the same chat as YouTube's own page.
 */
export function LiveChat({ streamUrl }: { streamUrl: string }) {
  const t = useTranslations("tedris.SessionPage");
  const dark = useSyncExternalStore(subscribeTheme, pageIsDark, () => false);
  const [host, setHost] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setHost(window.location.hostname);
    setOpen(window.matchMedia(WIDE).matches);
  }, []);

  const src = host ? liveChatUrlOf(streamUrl, { host, dark }) : null;
  const popout = liveChatPopoutUrlOf(streamUrl);

  return (
    <details
      className="mds-card group"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="mds-card__header flex cursor-pointer list-none items-center justify-between gap-3">
        <h2 className="mds-card__title flex items-center gap-2">
          <Icon name="chat" />
          {t("liveChatTitle")}
        </h2>
        <span className="flex items-center gap-1 mds-caption">
          <span className="group-open:hidden">{t("liveChatShow")}</span>
          <span className="hidden group-open:inline">{t("liveChatHide")}</span>
          <span className="transition-transform group-open:rotate-180">
            <Icon name="chevronDown" size="sm" />
          </span>
        </span>
      </summary>
      {open && src ? (
        <iframe
          // A new address (the theme changed) is a new frame.
          key={src}
          className="block inline-full border-0"
          style={{ blockSize: 480 }}
          src={src}
          title={t("liveChatTitle")}
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
        />
      ) : null}
      <div className="mds-card__body flex flex-col items-start gap-3">
        <p className="mds-caption">{t("liveChatText")}</p>
        {popout ? (
          <a
            className="mds-btn mds-btn--outline mds-btn--small"
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
    </details>
  );
}
