import { initials } from "./avatar";
import { cx } from "./cx";
import { formatNumber, usePageLocale } from "./locale";

export interface AvatarStackPerson {
  name?: string;
  src?: string;
}

export interface AvatarStackProps {
  people?: AvatarStackPerson[];
  /** how many avatars are drawn before the "+N" tile */
  max?: number;
  /** the whole group's size when it is larger than `people` */
  total?: number;
  /** names the stack as a group */
  label?: string;
  locale?: string;
  className?: string;
}

/** Small overlapping avatars and a last tile counting the rest: +N = total − shown. */
export function AvatarStack({
  people = [],
  max = 3,
  total,
  label,
  locale,
  className,
}: AvatarStackProps) {
  const { ref, lang } = usePageLocale<HTMLSpanElement>(locale);
  const shown = people.slice(0, Math.max(0, max));
  const more = Math.max(0, (total ?? people.length) - shown.length);
  return (
    <span
      ref={ref}
      className={cx("mds-avatar-stack", className)}
      {...(label ? { role: "group", "aria-label": label } : {})}
    >
      {shown.map((p, i) => (
        <span
          key={i}
          className="mds-avatar mds-avatar--sm"
          {...(p.name
            ? { role: "img", "aria-label": p.name }
            : { "aria-hidden": true as const })}
        >
          {p.src ? <img src={p.src} alt="" /> : initials(p.name, lang)}
        </span>
      ))}
      {more > 0 ? (
        <span
          className="mds-avatar mds-avatar--sm mds-avatar--more"
          aria-hidden={label ? true : undefined}
        >
          +{formatNumber(more, lang)}
        </span>
      ) : null}
    </span>
  );
}
