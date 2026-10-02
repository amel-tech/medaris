"use client";

import {
  Fragment,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * The page's locale (MDS-NUM-01): the `locale` prop, else the nearest `lang`
 * once mounted, else tr-TR. Attach the returned ref to the component's root.
 */
export function usePageLocale<T extends HTMLElement = HTMLElement>(
  locale?: string
): { ref: RefObject<T | null>; lang: string } {
  const ref = useRef<T | null>(null);
  const [found, setFound] = useState<string | null>(null);
  useEffect(() => {
    const el = ref.current?.closest<HTMLElement>("[lang]");
    setFound(el?.lang || null);
  }, []);
  return { ref, lang: locale ?? found ?? "tr-TR" };
}

/** Intl number in `locale`; a locale the runtime rejects falls back to tr-TR. */
export function formatNumber(
  n: number,
  locale: string,
  options?: Intl.NumberFormatOptions
): string {
  try {
    return new Intl.NumberFormat(locale, options).format(n);
  } catch {
    return new Intl.NumberFormat("tr-TR", options).format(n);
  }
}

/**
 * A meta run: each part but the last ends on its separator, so a wrapped line
 * ends on the dot and never starts with it.
 */
export function joinRun(parts: ReactNode[]): ReactNode[] {
  return parts.map((p, i) =>
    i < parts.length - 1 ? (
      <span key={`run${i}`}>
        {p}
        <span className="mds-sep" aria-hidden="true">
          ·
        </span>
      </span>
    ) : (
      <Fragment key={`run${i}`}>{p}</Fragment>
    )
  );
}

/** One `Intl.DateTimeFormat` in a zone; an unknown zone falls back to the viewer's. */
export function formatDate(
  locale: string,
  at: Date,
  timeZone: string | undefined,
  options: Intl.DateTimeFormatOptions
): string {
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(at);
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(at);
  }
}

/** Display names for the course zones; a zone missing here prints its IANA city. */
export const zoneCities: Record<string, string> = {
  "Europe/Istanbul": "İstanbul",
  "Europe/Berlin": "Berlin",
  "Europe/Amsterdam": "Amsterdam",
  "Europe/Brussels": "Brüksel",
  "Europe/Paris": "Paris",
  "Europe/Vienna": "Viyana",
  "Europe/London": "Londra",
  "America/New_York": "New York",
};

export function zoneName(zone: string, given?: string): string {
  return (
    given ??
    zoneCities[zone] ??
    (zone.split("/").pop() ?? zone).replace(/_/g, " ")
  );
}
