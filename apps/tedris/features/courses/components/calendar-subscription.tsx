"use client";

import {
  AppleLogoIcon as AppleLogo,
  ArrowsClockwiseIcon as ArrowsClockwise,
  CheckIcon as Check,
  CopyIcon as Copy,
  GoogleLogoIcon as GoogleLogo,
} from "@medaris/icons";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { regenerateMyCalendarFeed } from "../actions";

/** Google Calendar's "Add calendar → From URL" screen. */
const GOOGLE_ADD_BY_URL =
  "https://calendar.google.com/calendar/u/0/r/settings/addbyurl";

type FeedLink = { url: string; webcalUrl: string };

/**
 * B11 "Takvim aboneliği" (MDRS-120). B11 is not in the design-system mirror
 * yet (MDRS-127 is designing it), so this follows the pages' existing card
 * and outline-button pattern.
 *
 * tedrisat keeps only a hash of the feed secret, so an existing URL cannot
 * be shown again: the page says one exists and offers a new one, and a newly
 * issued URL is shown until the viewer leaves.
 */
export const CalendarSubscription = ({
  status,
}: {
  /**
   * When the current URL was issued (ISO time, or null without one); null
   * when tedrisat could not be asked.
   */
  status: { createdAt: string | null } | null;
}) => {
  const t = useTranslations("tedris");
  const format = useFormatter();
  const [issuedAt, setIssuedAt] = useState(status?.createdAt ?? null);
  const [link, setLink] = useState<FeedLink | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const issue = () => {
    // Always asked, not only when this page believes a link exists: the page
    // may be stale (another tab issued one) or may not have been able to ask
    // (status null), and a new link silently stops every subscribed calendar.
    if (!window.confirm(t("CalendarSubscription.confirmRegenerate"))) return;
    setFailed(false);
    startTransition(async () => {
      const result = await regenerateMyCalendarFeed();
      if (!result.success) {
        setFailed(true);
        return;
      }
      setLink({ url: result.data.url, webcalUrl: result.data.webcalUrl });
      setIssuedAt(new Date(result.data.createdAt).toISOString());
    });
  };

  // With a link just issued, the card below says so; the "shown only once"
  // line would read as an instruction to regenerate it again.
  const statusText = link
    ? null
    : issuedAt
      ? t("CalendarSubscription.active", {
          date: format.dateTime(new Date(issuedAt), { dateStyle: "medium" }),
        })
      : status === null
        ? t("CalendarSubscription.unknown")
        : t("CalendarSubscription.none");

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-5">
        {statusText && (
          <p className="mb-4 text-sm text-muted-foreground">{statusText}</p>
        )}
        <button
          type="button"
          onClick={issue}
          disabled={pending}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border bg-white px-3.5 py-2 text-[13px] font-medium disabled:opacity-50"
        >
          <ArrowsClockwise size={14} />
          {issuedAt
            ? t("CalendarSubscription.regenerate")
            : t("CalendarSubscription.create")}
        </button>
        {failed && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {t("CalendarSubscription.failed")}
          </p>
        )}
      </div>

      {link && (
        <div className="space-y-4 rounded-xl border bg-white p-5">
          <p className="text-sm font-medium">
            {t("CalendarSubscription.newLink")}
          </p>

          <section className="space-y-2">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <AppleLogo size={16} /> {t("CalendarSubscription.appleTitle")}
            </h2>
            <CopyableUrl value={link.webcalUrl} />
            <a
              href={link.webcalUrl}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3.5 py-2 text-[13px] font-medium"
            >
              {t("CalendarSubscription.appleOpen")}
            </a>
          </section>

          <section className="space-y-2">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <GoogleLogo size={16} /> {t("CalendarSubscription.googleTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("CalendarSubscription.googleSteps")}
            </p>
            <CopyableUrl value={link.url} />
            <a
              href={GOOGLE_ADD_BY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3.5 py-2 text-[13px] font-medium"
            >
              {t("CalendarSubscription.googleOpen")}
            </a>
          </section>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {t("CalendarSubscription.googleDelay")}
      </p>
      <p className="text-sm text-muted-foreground">
        {t("CalendarSubscription.private")}
      </p>
    </div>
  );
};

const CopyableUrl = ({ value }: { value: string }) => {
  const t = useTranslations("tedris");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard access (an insecure origin, a refused permission): the
      // field below is selectable, so the viewer can still copy by hand.
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-xs"
        dir="ltr"
      />
      <button
        type="button"
        onClick={copy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-[13px] font-medium"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied
          ? t("CalendarSubscription.copied")
          : t("CalendarSubscription.copy")}
      </button>
    </div>
  );
};
