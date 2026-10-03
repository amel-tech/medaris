"use client";

import { ChoiceChips } from "@medaris/ui/mds/choice-chips";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { Select } from "@medaris/ui/mds/select";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  type DiscoverQuery,
  discoverHref,
  LEVELS,
  type Level,
} from "../discover-query";

const ALL = "all";
const SEARCH_DELAY_MS = 400;

export interface DiscoverFilterLabels {
  filters: string;
  search: string;
  searchPlaceholder: string;
  level: string;
  allLevels: string;
  madrasah: string;
  allMadrasahs: string;
  field: string;
  allFields: string;
  /** Level names by `Levels.*`. */
  levelNames: Record<Level, string>;
}

/**
 * Keşfet's filter row (MDRS-159, design tedris/02): a search box, a level
 * select, a medrese select and the ilim alanı as chips. Each change writes the
 * address and the server page reads it back, so a filtered result is a link
 * and the back button returns to the filter before. A new filter starts again
 * at page one; the search waits for a pause in typing.
 */
export function DiscoverFilters({
  query,
  fields,
  madrasahs,
  labels,
}: {
  query: DiscoverQuery;
  fields: string[];
  madrasahs: { id: string; name: string }[];
  labels: DiscoverFilterLabels;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState(query.q);

  const go = (patch: Partial<DiscoverQuery>, replace = false) => {
    const href = discoverHref({ ...query, ...patch, page: 1 }, pathname);
    if (replace) router.replace(href);
    else router.push(href);
  };

  // The back button changes the address, not the box.
  useEffect(() => setText(query.q), [query.q]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only the typed text starts a search; `go` and the rest of the query are read as they are when the pause ends
  useEffect(() => {
    if (text.trim() === query.q) return;
    const timer = setTimeout(
      () => go({ q: text.trim() }, true),
      SEARCH_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <search
      className="flex min-inline-0 flex-col gap-4"
      aria-label={labels.filters}
    >
      <form
        className="grid items-center gap-grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] max-md:grid-cols-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim() !== query.q) go({ q: text.trim() }, true);
        }}
      >
        <Input
          type="search"
          name="q"
          aria-label={labels.search}
          placeholder={labels.searchPlaceholder}
          value={text}
          maxLength={100}
          onChange={(event) => setText(event.target.value)}
          leading={<Icon name="search" />}
        />
        <Select
          aria-label={labels.level}
          value={query.level ?? ALL}
          options={[
            { value: ALL, label: labels.allLevels },
            ...LEVELS.map((level) => ({
              value: level,
              label: labels.levelNames[level],
            })),
          ]}
          onChange={(value) =>
            go({ level: value && value !== ALL ? (value as Level) : null })
          }
        />
        <Select
          aria-label={labels.madrasah}
          value={query.madrasahId ?? ALL}
          options={[
            { value: ALL, label: labels.allMadrasahs },
            ...madrasahs.map((m) => ({ value: m.id, label: m.name })),
          ]}
          onChange={(value) =>
            go({ madrasahId: value && value !== ALL ? value : null })
          }
        />
      </form>
      {fields.length > 0 ? (
        <ChoiceChips
          legend={labels.field}
          value={query.field ?? ALL}
          options={[
            { value: ALL, label: labels.allFields },
            ...fields.map((field) => ({ value: field, label: field })),
          ]}
          onChange={(value) =>
            go({ field: value && value !== ALL ? value : null })
          }
        />
      ) : null}
    </search>
  );
}
