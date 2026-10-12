"use client";

import { Icon } from "@medaris/ui/mds/icon";
// Not the locale router: its typed pathnames know no lesson page. The rows
// go where the page's plain links go (`/courses/…/lessons/…`).
import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { joinRun } from "../join-run";
import { type PopupPlacement, placePopup } from "../popup-placement";
import { curriculumMatches, type SessionState } from "../session-model";

/** One celse of the list, worded on the server. */
export interface CurriculumOption {
  id: string;
  href: string;
  weekNumber: number;
  /** "Hafta 5" */
  week: string;
  title: string;
  state: SessionState;
  /** the run beside the title: its day, "Bu celse", "Şu an canlı", "İptal edildi", "Kayıt var" */
  meta: string[];
  /** the celse the page shows */
  current: boolean;
}

export interface CurriculumLabels {
  /** "Müfredat": the eyebrow, the popup's title and the list's name */
  curriculum: string;
  /** "12 celse" */
  count: string;
  /** the button's name: "Müfredat: Hafta 5 / 12, …" */
  trigger: string;
  /** "Bu celse" */
  viewing: string;
  /** "Hafta 5 / 12" */
  weekOf: string;
  /** the link to the course page's programme */
  course: string;
  /** the search field's placeholder */
  search: string;
  /** the search field's name */
  searchLabel: string;
  /** when the search finds nothing */
  noMatch: string;
  /** read after a done celse's title: ", sona erdi" */
  done: string;
}

/** How tall the list grows before it scrolls (the owner's "about 380 px"). */
const LIST_MAX = 380;
/** Between the button and the popup, and the popup and the window's edge: --space-2. */
const GAP = 8;

/** A row's mark: done, on air, cancelled, or still ahead. */
const Marker = ({ state }: { state: SessionState }) => (
  <span
    className="flex size-4 flex-none items-center justify-center text-neutral-subtle"
    aria-hidden="true"
  >
    {state === "ended" ? (
      <Icon name="check" size="sm" />
    ) : state === "cancelled" ? (
      <Icon name="ban" size="sm" />
    ) : state === "live" ? (
      <span className="mds-badge__dot text-live-default" />
    ) : (
      <span className="block size-2 rounded-full border border-neutral-control" />
    )}
  </span>
);

/** Scrolls the list, and only the list, so the row is in sight; to its middle when `centre`. */
const reveal = (list: HTMLElement, row: HTMLElement, centre: boolean) => {
  const top = row.offsetTop;
  const bottom = top + row.offsetHeight;
  if (centre) {
    list.scrollTop = top - (list.clientHeight - row.offsetHeight) / 2;
  } else if (top < list.scrollTop) {
    list.scrollTop = top;
  } else if (bottom > list.scrollTop + list.clientHeight) {
    list.scrollTop = bottom - list.clientHeight;
  }
};

/**
 * "Müfredat" at the foot of the celse detail page (MDRS-289), between the
 * previous and the next celse: a button as tall as they are (the eyebrow,
 * this celse's title, a thin bar with "Hafta 5 / 12") that opens the whole
 * programme. The owner: "müfredat listesi bi combobox olsun, tıklayınca
 * dropdown açılsın (aşağıda yer yoksa yukarıda) scrollview ile tüm müfredatı
 * gezebilsin talebe".
 *
 * The popup opens below the button when it fits there, otherwise above
 * (`placePopup`, measured on open and on resize and scroll while open). It
 * holds "Müfredat · N celse" with a link to the course page's programme, a
 * search field (week or title), and a listbox of every celse, this one
 * selected, brought to the middle and focused. Arrows, Home, End and the
 * page keys move through it, Enter or Space goes to the celse, and a typed
 * letter goes to the search field, whose arrows come back to the list.
 * Escape closes and gives the focus back to the button; a click outside,
 * or Tab past the popup, closes too.
 *
 * Hand-rolled on the kit's `.mds-popup` and `.mds-option`, the focus roving
 * over the rows as in the kit's time field: Base UI's Combobox keeps the
 * focus in its search field, where Home, End and Space belong to the text,
 * and lets Floating UI choose the side.
 */
export function SessionCurriculum({
  options,
  title,
  progress,
  courseHref,
  locale,
  labels,
}: {
  options: readonly CurriculumOption[];
  /** this celse's title, on the button */
  title: string;
  /** where this celse is in the programme, 0 to 100 */
  progress: number;
  /** the course page's programme */
  courseHref: string;
  locale: string;
  labels: CurriculumLabels;
}) {
  const router = useRouter();
  const base = useId();
  const listId = `${base}list`;
  const searchId = `${base}search`;
  const optionId = (id: string) => `${base}option-${id}`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const centred = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [placement, setPlacement] = useState<PopupPlacement | null>(null);

  const current = options.find((option) => option.current) ?? null;
  const shown = useMemo(
    () => options.filter((option) => curriculumMatches(option, query, locale)),
    [options, query, locale]
  );
  const at = shown.findIndex((option) => option.id === active);

  const show = () => {
    setQuery("");
    setActive(current?.id ?? options[0]?.id ?? null);
    setPlacement(null);
    centred.current = false;
    setOpen(true);
  };

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const go = (option: CurriculumOption) => {
    close(true);
    if (!option.current) router.push(option.href);
  };

  // A new query starts from its first row; an empty one from this celse.
  const search = (next: string) => {
    setQuery(next);
    const found = options.filter((option) =>
      curriculumMatches(option, next, locale)
    );
    setActive(
      (next.trim() ? null : found.find((option) => option.current)?.id) ??
        found[0]?.id ??
        null
    );
  };

  const move = (to: number) => {
    const option = shown[Math.max(0, Math.min(shown.length - 1, to))];
    if (option) setActive(option.id);
  };

  // Where the popup opens: measured once it is drawn, before it is painted,
  // and again while it is open whenever the window is resized or scrolled.
  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const popup = popupRef.current;
    const list = listRef.current;
    if (!trigger || !popup || !list) return;
    const next = placePopup({
      anchor: trigger.getBoundingClientRect(),
      viewport: { top: GAP, bottom: window.innerHeight - GAP },
      height:
        popup.offsetHeight -
        list.clientHeight +
        Math.min(list.scrollHeight, LIST_MAX),
      gap: GAP,
    });
    setPlacement((prev) =>
      prev?.side === next.side && prev.room === next.room ? prev : next
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onScroll = (event: Event) => {
      // the list's own scrolling moves nothing
      if (!popupRef.current?.contains(event.target as Node)) place();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [open, place]);

  // Once placed, this celse's row comes to the middle of the list and takes
  // the focus; after that the focus follows the active row while it is in
  // the list, and the row is kept in sight.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!open || !placement || !list) return;
    const first = !centred.current;
    centred.current = true;
    const row = active ? document.getElementById(optionId(active)) : null;
    if (row) reveal(list, row, first);
    if (!(first || list.contains(document.activeElement))) return;
    if (row && document.activeElement !== row)
      row.focus({ preventScroll: true });
    else if (!row && first) list.focus({ preventScroll: true });
  });

  // A click outside closes. When it lands where nothing takes the focus,
  // the focus comes back to the button rather than to the page. Tab past
  // the popup closes it too; a window losing the focus does not.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!open || !wrap) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target && wrap.contains(target)) return;
      close(false);
      if (
        !target?.closest?.(
          "a[href], button, input, select, textarea, [tabindex]"
        )
      ) {
        setTimeout(() => {
          const now = document.activeElement;
          if (!now || now === document.body) {
            triggerRef.current?.focus({ preventScroll: true });
          }
        }, 0);
      }
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      if (next && !wrap.contains(next)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    wrap.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      wrap.removeEventListener("focusout", onFocusOut);
    };
  }, [open, close]);

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const { key } = event;
    if (key === "ArrowDown") move(at < 0 ? 0 : at + 1);
    else if (key === "ArrowUp") move(at < 0 ? 0 : at - 1);
    else if (key === "Home") move(0);
    else if (key === "End") move(shown.length - 1);
    else if (key === "PageDown") move(at + 8);
    else if (key === "PageUp") move(at - 8);
    else if (key === "Enter" || key === " ") {
      const option = shown[at];
      if (option) go(option);
    } else if (key === "Escape") close(true);
    else if (key === "Backspace") {
      search(query.slice(0, -1));
      searchRef.current?.focus();
    } else if (
      key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      // a typed letter starts a search
      search(query + key);
      searchRef.current?.focus();
    } else return;
    event.preventDefault();
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const { key } = event;
    if (key === "ArrowDown" || key === "ArrowUp") {
      const option = shown[at < 0 ? 0 : at];
      if (option) {
        setActive(option.id);
        document.getElementById(optionId(option.id))?.focus();
      }
    } else if (key === "Enter") {
      const option = shown[at] ?? shown[0];
      if (option) go(option);
    } else if (key === "Escape") close(true);
    else return;
    event.preventDefault();
  };

  const optionOf = (target: EventTarget) => {
    const row = (target as Element).closest?.<HTMLElement>("[data-option]");
    return row
      ? shown.find((option) => option.id === row.dataset.option)
      : undefined;
  };

  const onEscape = (event: KeyboardEvent) => {
    if (open && event.key === "Escape") {
      event.preventDefault();
      close(true);
    }
  };

  // Unbounded while it is measured (`.mds-popup` caps it at 320px), then
  // capped to the room on its side.
  const popupStyle: CSSProperties = {
    maxBlockSize: placement ? placement.room : "none",
  };

  return (
    <div
      ref={wrapRef}
      className="relative flex min-inline-0 flex-[1_1_var(--layout-aside)] max-md:order-first max-md:basis-full"
      data-testid="session-curriculum"
    >
      <button
        ref={triggerRef}
        type="button"
        className="mds-card mds-card--interactive flex min-block-20 min-inline-0 flex-1 cursor-pointer items-stretch p-0 text-start text-neutral-default"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={labels.trigger}
        onClick={() => (open ? close(true) : show())}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            show();
          } else onEscape(event);
        }}
      >
        <span className="flex min-inline-0 flex-1 flex-col justify-center gap-1 px-4">
          <span className="mds-eyebrow truncate">{labels.curriculum}</span>
          <span className="mds-label truncate font-semibold">
            <bdi>{title}</bdi>
            <span className="font-regular text-neutral-subtle">
              <span className="mds-sep">·</span>
              {labels.viewing}
            </span>
          </span>
          <span className="flex items-center gap-3">
            <span className="mds-progress flex-1">
              <span
                className="mds-progress__bar block"
                style={{ "--mds-progress": `${progress}%` } as CSSProperties}
              />
            </span>
            <span className="mds-caption whitespace-nowrap">
              {labels.weekOf}
            </span>
          </span>
        </span>
        <span className="flex inline-12 flex-none items-center justify-center border-s border-neutral-subtle">
          <Icon name="chevronsUpDown" />
        </span>
      </button>

      {open ? (
        <div
          ref={popupRef}
          className={`mds-popup absolute inset-x-0 flex flex-col gap-2 overflow-hidden p-2${
            placement?.side === "above"
              ? " inset-be-[calc(100%+var(--space-2))]"
              : " inset-bs-[calc(100%+var(--space-2))]"
          }${placement ? "" : " invisible"}`}
          style={popupStyle}
          data-side={placement?.side}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 pbs-1">
            <p className="mds-label">
              {labels.curriculum}
              <span className="font-regular text-neutral-subtle">
                <span className="mds-sep" aria-hidden="true">
                  ·
                </span>
                {labels.count}
              </span>
            </p>
            <a
              className="mds-link mds-caption"
              href={courseHref}
              onKeyDown={onEscape}
            >
              {labels.course}
            </a>
          </div>
          <label className="mds-visually-hidden" htmlFor={searchId}>
            {labels.searchLabel}
          </label>
          <input
            ref={searchRef}
            id={searchId}
            className="mds-input flex-none"
            type="search"
            autoComplete="off"
            enterKeyHint="go"
            placeholder={labels.search}
            aria-controls={listId}
            value={query}
            onChange={(event) => search(event.target.value)}
            onKeyDown={onSearchKeyDown}
          />
          {shown.length === 0 ? (
            <p className="mds-caption px-3 py-2">{labels.noMatch}</p>
          ) : null}
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={labels.curriculum}
            className="relative flex min-block-0 flex-col gap-[2px] overflow-y-auto overscroll-contain pe-1"
            style={{ maxBlockSize: LIST_MAX }}
            onKeyDown={onListKeyDown}
            onClick={(event) => {
              const option = optionOf(event.target);
              if (option) go(option);
            }}
            onPointerMove={(event) => {
              const option = optionOf(event.target);
              if (option && option.id !== active) setActive(option.id);
            }}
          >
            {shown.map((option) => (
              <div
                key={option.id}
                id={optionId(option.id)}
                role="option"
                tabIndex={option.id === active ? 0 : -1}
                aria-selected={option.current}
                data-option={option.id}
                data-state={option.state}
                data-selected={option.current ? "" : undefined}
                data-highlighted={option.id === active ? "" : undefined}
                className={`mds-option min-block-control-large cursor-pointer gap-3 py-1${
                  option.current
                    ? " bg-neutral-sunken data-highlighted:bg-neutral-hover"
                    : ""
                }`}
              >
                <Marker state={option.state} />
                <span className="mds-caption min-inline-14 flex-none">
                  {option.week}
                </span>
                <span className="flex min-inline-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span dir="auto">
                    {option.title}
                    {option.state === "ended" ? (
                      <span className="mds-visually-hidden">{labels.done}</span>
                    ) : null}
                  </span>
                  {option.meta.length > 0 ? (
                    <span className="mds-caption font-regular">
                      {joinRun(option.meta)}
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
