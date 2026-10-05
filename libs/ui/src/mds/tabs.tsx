import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cx } from "./cx";

export interface TabItem {
  value: string;
  label: ReactNode;
  count?: number;
  /** `mode="links"` only */
  href?: string;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange?: (value: string) => void;
  /** the tablist's accessible name */
  label: string;
  /** "tabs": the APG tabs pattern, the caller renders the panels with `TabsPanel`.
   *  "links": navigation between pages, a named `<nav>` of links, no tab roles. */
  mode?: "tabs" | "links";
  /** the page's locale for the counts; else the nearest `lang`, else tr-TR */
  locale?: string;
  className?: string;
  /** `TabsPanel`s, `mode="tabs"` only */
  children?: ReactNode;
}

function formatCount(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale).format(n);
  } catch {
    return new Intl.NumberFormat("tr-TR").format(n);
  }
}

function usePageLocale(locale: string | undefined) {
  const ref = useRef<HTMLElement | null>(null);
  const [found, setFound] = useState<string | null>(null);
  useEffect(() => {
    const el = ref.current?.closest<HTMLElement>("[lang]");
    setFound(el?.lang || null);
  }, []);
  return { ref, lang: locale ?? found ?? "tr-TR" };
}

/**
 * Base UI `Tabs` with `.mds-tabs`/`.mds-tab` (canvas rule 7: `activateOnFocus`,
 * no `Tabs.Indicator`; the underline is the selected tab's own border). Arrow
 * keys move and select, Home/End jump, mirrored in RTL by Base UI.
 */
export function Tabs({
  tabs,
  value,
  onChange,
  label,
  mode = "tabs",
  locale,
  className,
  children,
}: TabsProps) {
  const { ref, lang } = usePageLocale(locale);
  const panelsRef = useRef<HTMLDivElement>(null);
  const [panelsMinBlockSize, setPanelsMinBlockSize] = useState(0);
  const count = (t: TabItem) =>
    t.count != null ? (
      <span className="mds-tab__count">{formatCount(t.count, lang)}</span>
    ) : null;

  if (mode === "links") {
    return (
      <nav
        ref={ref as React.RefObject<HTMLElement>}
        className={cx("mds-tabs", className)}
        aria-label={label}
      >
        {tabs.map((t) => (
          <a
            key={t.value}
            className="mds-tab"
            href={t.href}
            aria-current={t.value === value ? "page" : undefined}
          >
            {t.label}
            {count(t)}
          </a>
        ))}
      </nav>
    );
  }
  return (
    <BaseTabs.Root
      value={value}
      onValueChange={(v) => {
        // A shorter panel must not shorten the page under the reader: the
        // browser would clamp the scroll position and the tab row would jump.
        // The panel area keeps the tallest height it has shown.
        const shown = panelsRef.current?.offsetHeight ?? 0;
        setPanelsMinBlockSize((tallest) => Math.max(tallest, shown));
        onChange?.(String(v));
      }}
    >
      <BaseTabs.List
        ref={ref as React.RefObject<HTMLDivElement>}
        activateOnFocus
        aria-label={label}
        className={cx("mds-tabs", className)}
      >
        {tabs.map((t) => (
          <BaseTabs.Tab key={t.value} value={t.value} className="mds-tab">
            {t.label}
            {count(t)}
          </BaseTabs.Tab>
        ))}
      </BaseTabs.List>
      <div
        ref={panelsRef}
        data-tabs-panels=""
        style={
          panelsMinBlockSize ? { minBlockSize: panelsMinBlockSize } : undefined
        }
      >
        {children}
      </div>
    </BaseTabs.Root>
  );
}

/** The panel of one tab; renders inside `Tabs`. */
export function TabsPanel({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <BaseTabs.Panel value={value} className={className}>
      {children}
    </BaseTabs.Panel>
  );
}
