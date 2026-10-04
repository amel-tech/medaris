import { Icon } from "@medaris/ui/mds/icon";
import type { ReactNode } from "react";

/**
 * The player card of the session page and of the recordings tab (designs
 * tedris/16, 17, 24): a 16:9 frame over a title and one line of facts. With an
 * embed address the frame is the provider's player; without one it is the
 * placeholder, or a link out for a recording that only opens at its host.
 * Server-safe: no state, so it renders in both trees.
 */
export const MediaPlayer = ({
  id,
  title,
  embedUrl,
  placeholder,
  openHref,
  openLabel,
  children,
  heading = 2,
  frameId,
}: {
  id: string;
  title: string;
  embedUrl: string | null;
  /** The text of the empty frame: "Ders kaydı burada oynar". */
  placeholder: string;
  /** For a recording that cannot be framed: where it opens. */
  openHref?: string | null;
  openLabel?: string;
  /** The line under the title. */
  children?: ReactNode;
  heading?: 2 | 3;
  /** The frame's `id`, for a client piece that attaches the player API to it (MDRS-150). */
  frameId?: string;
}) => {
  const Heading = `h${heading}` as "h2";
  return (
    <section className="mds-card" aria-labelledby={id}>
      <div className="mds-card__media">
        {embedUrl ? (
          <iframe
            id={frameId}
            className="block inline-full border-0 aspect-video"
            src={embedUrl}
            title={title}
            loading="lazy"
            allow="encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          />
        ) : (
          <div className="mds-join__status flex aspect-video flex-col items-center justify-center gap-3 text-center">
            <Icon name="playCircle" size="lg" />
            <span>{placeholder}</span>
            {openHref ? (
              <a
                className="mds-btn mds-btn--outline mds-btn--small"
                href={openHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                {openLabel}
                <Icon name="externalLink" size="sm" />
              </a>
            ) : null}
          </div>
        )}
      </div>
      <div className="mds-card__header">
        <Heading className="mds-card__title" id={id} dir="auto">
          {title}
        </Heading>
      </div>
      {children ? <p className="mds-card__body">{children}</p> : null}
    </section>
  );
};
