/* Browser bundle of the design-system components - GENERATED.
 *
 * Concatenated from ../src/components/ with imports/exports stripped and each
 * file wrapped in its own scope, so Babel-standalone can compile the set in a
 * plain browser with no bundler. This is what the docs pages load.
 *
 * Regenerate after editing ANY component:
 *   node tools/build-docs.mjs
 *
 * Application code should NOT load this - import from the package instead.
 * Exposes: window.MadrasahDS
 */

/* ---------- brand/Icon ---------- */
const { Icon, ICON_NAMES, FILLED_ICON_NAMES } = (function () {
/** The one line-icon set: stroke currentColor, 1.6 weight, round caps, 24x24 box. */
const PATHS = {
  search: "M18 18l-3.5-3.5M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9Zm4 13a2 2 0 0 0 4 0",
  globe: "M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z",
  home: "M4 11.5 12 4l8 7.5M6 10v9h12v-9M10 19v-5h4v5",
  book: "M4 4h12a4 4 0 0 1 4 4v13H8a4 4 0 0 1-4-4V4Zm0 0v13a4 4 0 0 1 4-4h12",
  table: "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Zm0 3h16M10 10v9",
  sidebar: "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Zm6-2v14",
  users: "M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M9 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7ZM17 14c2.8 0 5 2.2 5 5M17 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z",
  calendar: "M3.5 10h17M8 3v4M16 3v4M5.5 5h13a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  clock: "M12 7v5l3 2M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z",
  headset: "M3 14v-2a9 9 0 1 1 18 0v2m-3 6h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2v8Zm-12 0h2v-8H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2Z",
  pdf: "M7 3h7l4 4v14H7V3Zm7 0v4h4",
  doc: "M7 3h7l4 4v14H7V3Zm7 0v4h4M10 13h6M10 17h4",
  quiz: "M12 17v.5M9.5 9.5a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.1.9-1.1 1.7v.5M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z",
  playCircle: "M10 8.5v7l6-3.5-6-3.5ZM12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z",
  check: "m5 12 5 5L20 6",
  close: "m6 6 12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M9 7V4h6v3m-7 0v13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Zm10-3a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z",
  link: "M10 14a4 4 0 0 1 0-5.7l2.8-2.8a4 4 0 1 1 5.7 5.7L17 12.7m-3-2.7a4 4 0 0 1 0 5.7L11.3 18.5a4 4 0 1 1-5.7-5.7L7 11.4",
  download: "M12 4v12m0 0-4-4m4 4 4-4M5 20h14",
  upload: "M12 16V4m0 0-4 4m4-4 4 4M5 20h14",
  share: "m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6M6 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM18 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM18 15.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 21l1.6-4.4A8 8 0 1 1 21 12Z",
  filter: "M4 5h16l-6 8v6l-4-2v-4L4 5Z",
  settings: "M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.9l.1-.1A1.7 1.7 0 0 0 3.1 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.5l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z",
  certificate: "M12 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm-3 9-2 7 5-3 5 3-2-7",
  shield: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z",
  lock: "M8 10V7a4 4 0 1 1 8 0v3M6 10h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z",
  bookmark: "M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-3.5L6 21V4Z",
  chevronDown: "m6 9 6 6 6-6",
  chevronRight: "m9 6 6 6-6 6",
  chevronLeft: "m15 6-6 6 6 6",
  chevronsUpDown: "m8 9 4-4 4 4M8 15l4 4 4-4",
  arrowRight: "M5 12h14m-6-6 6 6-6 6",
  arrowLeft: "M19 12H5m6 6-6-6 6-6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

const FILLED = {
  star: "m12 3 2.7 5.7 6.3.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.3-.9L12 3Z",
  play: "M8 5v14l11-7L8 5Z",
};

function Icon({ name, size = 18, filled = false, style, ...rest }) {
  const d = filled ? FILLED[name] : PATHS[name];
  if (!d) return null;
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block", flexShrink: 0, ...style }}
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}

const ICON_NAMES = [...Object.keys(PATHS)];
const FILLED_ICON_NAMES = [...Object.keys(FILLED)];
return { Icon, ICON_NAMES, FILLED_ICON_NAMES };
})();

/* ---------- brand/Logo ---------- */
const { Logo } = (function () {
/**
 * Brand marks. "madrasah" is the talebe-facing Tedris mark (navy, dome + mihrab),
 * "nizam" is the müderris-facing management mark (dark shell, light arch).
 */
function Logo({ mark = "madrasah", size = 40, withWordmark = false, subtitle, style }) {
  const glyph =
    mark === "nizam" ? (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
        <rect width="48" height="48" rx="12" fill="var(--nizam-shell)" />
        <path d="M24 13c-3.6 0-6.5 2.9-6.5 6.5V33a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V19.5C30.5 15.9 27.6 13 24 13Z" fill="var(--nizam-shell-fg)" />
        <path d="M24 18c-1.7 0-3 1.3-3 3v12a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V21c0-1.7-1.3-3-3-3Z" fill="var(--nizam-shell)" />
      </svg>
    ) : (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
        <rect width="48" height="48" rx="9" fill="var(--brand-navy)" />
        <path d="M24 9c-1.6 3-3.4 4.8-6 6.4v15.8h12V15.4C27.4 13.8 25.6 12 24 9Z" fill="#dbeafe" />
        <rect x="18" y="33" width="12" height="6" fill="#dbeafe" />
        <rect x="22.2" y="20" width="3.6" height="11" rx="1.8" fill="var(--brand-navy)" />
        <circle cx="24" cy="12" r="0.9" fill="var(--brand-navy)" />
      </svg>
    );

  if (!withWordmark) return glyph;

  const word = mark === "nizam" ? "Nizam" : "Online Madrasah";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, ...style }}>
      {glyph}
      <div style={{ lineHeight: 1.15, minWidth: 0 }}>
        <div style={{
          font: `var(--fw-bold) ${mark === "nizam" ? "var(--fs-19)" : "var(--fs-17)"}/1.15 var(--font-ui)`,
          letterSpacing: "var(--tracking-heading)",
          color: mark === "nizam" ? "var(--ink)" : "var(--brand-navy)",
          whiteSpace: "nowrap",
        }}>{word}</div>
        {subtitle && (
          <div style={{ font: "var(--fw-regular) var(--fs-12-5)/1.3 var(--font-ui)", color: "var(--muted)" }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
return { Logo };
})();

/* ---------- brand/CoverPattern ---------- */
const { CoverPattern } = (function () {
/**
 * The course/köşk cover placeholder: a soft oklch wash at a given hue with an
 * arabesque arc pattern. Stands in for real cover imagery everywhere.
 */
function CoverPattern({ hue = 220, height = 140, label, dense = false, style }) {
  const id = `cp-${hue}-${height}`;
  return (
    <div style={{
      height,
      borderRadius: "var(--r-8)",
      background: `linear-gradient(135deg, oklch(0.94 0.04 ${hue}) 0%, oklch(0.88 0.07 ${hue}) 100%)`,
      color: `oklch(0.32 0.08 ${hue})`,
      position: "relative", overflow: "hidden",
      display: "flex", alignItems: "flex-end",
      padding: dense ? 14 : 18,
      ...style,
    }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.18 }} aria-hidden="true">
        <defs>
          <pattern id={id} width="36" height="36" patternUnits="userSpaceOnUse">
            <path d="M0 18a18 18 0 0 1 36 0M0 18a18 18 0 0 0 36 0" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
      {label && (
        <div style={{
          position: "relative", font: `var(--fw-regular) var(--fs-11)/1 var(--font-mono)`,
          letterSpacing: "0.4px", textTransform: "uppercase", opacity: 0.7,
        }}>{label}</div>
      )}
    </div>
  );
}
return { CoverPattern };
})();

/* ---------- core/Button ---------- */
const { Button } = (function () {
const BASE = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  border: "none", cursor: "pointer", textDecoration: "none",
  fontFamily: "var(--font-ui)", fontWeight: "var(--fw-medium)",
  whiteSpace: "nowrap",
};

const SIZES = {
  sm: { padding: "7px 12px", fontSize: "var(--fs-13)", gap: 6, borderRadius: "var(--r-6)" },
  md: { padding: "10px 16px", fontSize: "var(--fs-14)", gap: 8, borderRadius: "var(--r-8)" },
  lg: { padding: "12px 18px", fontSize: "var(--fs-15)", gap: 8, borderRadius: "var(--r-9)" },
};

const VARIANTS = {
  primary: { background: "var(--action-primary)", color: "var(--text-inverse)" },
  create:  { background: "var(--action-create)", color: "var(--text-inverse)" },
  danger:  { background: "var(--danger)", color: "var(--text-inverse)" },
  ghost:   { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)" },
  quiet:   { background: "transparent", color: "var(--muted)" },
  link:    { background: "transparent", color: "var(--accent)", padding: 0, fontWeight: "var(--fw-medium)" },
};

function Button({
  variant = "primary", size = "md", icon, iconAfter, fullWidth,
  disabled, as = "button", children, style, ...rest
}) {
  const Tag = as;
  return (
    <Tag
      disabled={Tag === "button" ? disabled : undefined}
      style={{
        ...BASE, ...SIZES[size], ...VARIANTS[variant],
        ...(variant === "link" ? { padding: 0 } : null),
        width: fullWidth ? "100%" : undefined,
        opacity: disabled ? 0.45 : 1,
        pointerEvents: disabled ? "none" : undefined,
        transition: "var(--transition-hover)",
        ...style,
      }}
      {...rest}
    >
      {icon}
      {children}
      {iconAfter}
    </Tag>
  );
}
return { Button };
})();

/* ---------- core/IconButton ---------- */
const { IconButton } = (function () {
const SIZES = { sm: 32, md: 38, lg: 40 };

function IconButton({ icon, label, variant = "ghost", size = "md", style, ...rest }) {
  const px = SIZES[size];
  const skin =
    variant === "bare"
      ? { background: "transparent", border: "none", color: "var(--muted)" }
      : variant === "solid"
      ? { background: "var(--action-primary)", border: "none", color: "var(--text-inverse)" }
      : { background: "var(--surface)", border: "1px solid var(--line)", color: "var(--slate-500)" };

  return (
    <button
      aria-label={label} title={label}
      style={{
        width: px, height: px, display: "inline-flex", alignItems: "center", justifyContent: "center",
        borderRadius: variant === "bare" ? "var(--r-4)" : "var(--r-9)",
        cursor: "pointer", padding: 0, flexShrink: 0,
        transition: "var(--transition-hover)", ...skin, ...style,
      }}
      {...rest}
    >
      {icon}
    </button>
  );
}
return { IconButton };
})();

/* ---------- core/Badge ---------- */
const { Badge } = (function () {
const TONES = {
  neutral:  { color: "var(--muted)", background: "var(--surface-sunken)" },
  accent:   { color: "var(--accent)", background: "var(--accent-soft)" },
  success:  { color: "var(--success-fg)", background: "var(--success-bg)" },
  warning:  { color: "var(--warning)", background: "var(--warning-bg)" },
  live:     { color: "var(--danger)", background: "var(--danger-bg)" },
  published:{ color: "var(--text-inverse)", background: "var(--action-primary)" },
  draft:    { color: "var(--text-inverse)", background: "var(--slate-500)" },
};

function Badge({ tone = "neutral", icon, dot = false, shape = "pill", children, style, ...rest }) {
  const t = TONES[tone];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        font: "var(--fw-semibold) var(--fs-12)/1 var(--font-ui)",
        padding: shape === "chip" ? "5px 12px" : "3px 9px",
        borderRadius: shape === "chip" ? "var(--r-status-chip)" : "var(--r-badge)",
        whiteSpace: "nowrap", ...t, ...style,
      }}
      {...rest}
    >
      {dot && <span style={{ width: 8, height: 8, borderRadius: "var(--r-pill)", background: "currentColor" }} />}
      {icon}
      {children}
    </span>
  );
}
return { Badge };
})();

/* ---------- core/Pill ---------- */
const { Pill } = (function () {
function Pill({ active = false, tag = false, icon, children, style, ...rest }) {
  const skin = tag
    ? { background: "var(--surface-sunken)", color: "var(--ink)", cursor: "default" }
    : active
    ? { background: "var(--action-primary)", color: "var(--text-inverse)" }
    : { background: "var(--surface-sunken)", color: "var(--ink)" };

  return (
    <button
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        border: "none", borderRadius: "var(--r-pill)",
        padding: tag ? "4px 10px" : "8px 14px",
        font: `var(--fw-medium) ${tag ? "var(--fs-12)" : "var(--fs-13)"}/1 var(--font-ui)`,
        whiteSpace: "nowrap", flexShrink: 0,
        cursor: tag ? "default" : "pointer",
        transition: "var(--transition-hover)",
        ...skin, ...style,
      }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
return { Pill };
})();

/* ---------- core/Avatar ---------- */
const { Avatar, AvatarStack } = (function () {
function Avatar({ initials = "MD", hue, size = 32, shape = "circle", ring = true, style, ...rest }) {
  const hasHue = typeof hue === "number";
  return (
    <div
      style={{
        width: size, height: size, flexShrink: 0,
        borderRadius: shape === "square" ? "var(--r-avatar-square)" : "var(--r-pill)",
        background: hasHue ? `oklch(0.92 0.05 ${hue})` : "var(--avatar-ground)",
        color: hasHue ? `oklch(0.32 0.08 ${hue})` : "var(--ink)",
        display: "grid", placeItems: "center",
        font: `var(--fw-semibold) ${Math.round(size * 0.38)}px/1 var(--font-ui)`,
        border: ring && shape === "circle" ? "2px solid var(--white)" : undefined,
        ...style,
      }}
      {...rest}
    >
      {initials}
    </div>
  );
}

function AvatarStack({ people = [], size = 30, max = 5, overflow, style }) {
  const shown = people.slice(0, max);
  const rest = overflow ?? Math.max(0, people.length - max);
  return (
    <div style={{ display: "flex", ...style }}>
      {shown.map((p, i) => (
        <div key={i} style={{ marginLeft: i ? -8 : 0 }}>
          <Avatar initials={p.initials} hue={p.hue} size={size} />
        </div>
      ))}
      {rest > 0 && (
        <div style={{
          marginLeft: -8, width: size, height: size, borderRadius: "var(--r-pill)",
          background: "var(--surface-sunken)", color: "var(--muted)",
          display: "grid", placeItems: "center",
          font: `var(--fw-semibold) ${Math.round(size * 0.34)}px/1 var(--font-ui)`,
          border: "2px solid var(--white)",
        }}>+{rest}</div>
      )}
    </div>
  );
}
return { Avatar, AvatarStack };
})();

/* ---------- core/Card ---------- */
const { Card } = (function () {
function Card({ app = "tedris", interactive = false, pad, media, footer, children, style, ...rest }) {
  const isNizam = app === "nizam";
  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: `1px solid ${isNizam ? "var(--line)" : "var(--border)"}`,
        borderRadius: "var(--r-card)",
        overflow: "hidden",
        display: "flex", flexDirection: "column",
        cursor: interactive ? "pointer" : undefined,
        transition: interactive ? "var(--transition-hover)" : undefined,
        ...style,
      }}
      {...rest}
    >
      {media}
      <div style={{ padding: pad ?? (isNizam ? "var(--pad-card-nizam)" : "var(--pad-card)"), flex: 1 }}>
        {children}
      </div>
      {footer && (
        <div style={{
          borderTop: "1px solid var(--line-soft)",
          padding: isNizam ? "14px var(--pad-card-nizam)" : "12px var(--pad-card)",
        }}>{footer}</div>
      )}
    </div>
  );
}
return { Card };
})();

/* ---------- core/Progress ---------- */
const { ProgressBar, ProgressRing } = (function () {
function ProgressBar({ value = 0, height = 5, tone, showLabel = false, label, style }) {
  const pct = Math.max(0, Math.min(1, value));
  const fill = tone ? `var(--${tone})` : pct >= 1 ? "var(--success)" : "var(--accent)";
  return (
    <div style={style}>
      <div style={{ height, background: "var(--surface-sunken)", borderRadius: "var(--r-pill)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct * 100}%`, background: fill, borderRadius: "var(--r-pill)" }} />
      </div>
      {(showLabel || label) && (
        <div style={{
          display: "flex", justifyContent: "space-between", marginTop: 6,
          font: "var(--fw-regular) var(--fs-11)/1.3 var(--font-ui)", color: "var(--muted)",
        }}>
          <span>{label ?? `%${Math.round(pct * 100)} tamamlandı`}</span>
        </div>
      )}
    </div>
  );
}

function ProgressRing({ value = 0, size = 58, thickness = 7, style }) {
  const r = (size - thickness) / 2 - 1;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={style} aria-hidden="true">
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth={thickness} />
      <circle
        cx={mid} cy={mid} r={r} fill="none" stroke="var(--accent)" strokeWidth={thickness}
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
        transform={`rotate(-90 ${mid} ${mid})`}
      />
    </svg>
  );
}
return { ProgressBar, ProgressRing };
})();

/* ---------- forms/Field ---------- */
const { Field } = (function () {
function Field({ label, required = false, hint, htmlFor, children, style }) {
  return (
    <label htmlFor={htmlFor} style={{ display: "block", ...style }}>
      {label && (
        <div style={{
          font: "var(--fw-medium) var(--fs-14)/1.3 var(--font-ui)",
          color: "var(--ink)", marginBottom: 7,
        }}>
          {label}
          {required && <span style={{ color: "var(--danger)", marginLeft: 4 }}>*</span>}
        </div>
      )}
      {children}
      {hint && (
        <div style={{
          font: "var(--fw-regular) var(--fs-13)/1.45 var(--font-ui)",
          color: "var(--muted)", marginTop: 7,
        }}>{hint}</div>
      )}
    </label>
  );
}
return { Field };
})();

/* ---------- forms/Input ---------- */
const { controlStyle, Input, Textarea } = (function () {
const controlStyle = {
  width: "100%",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-input)",
  padding: "11px 14px",
  font: "var(--fw-regular) var(--fs-15)/1.4 var(--font-ui)",
  color: "var(--ink)",
  background: "var(--surface)",
  outline: "none",
  boxSizing: "border-box",
};

function Input({ mono = false, invalid = false, style, ...rest }) {
  return (
    <input
      style={{
        ...controlStyle,
        ...(mono ? { fontFamily: "var(--font-mono)", fontSize: "var(--fs-13-5)" } : null),
        ...(invalid ? { borderColor: "var(--danger)" } : null),
        ...style,
      }}
      {...rest}
    />
  );
}

function Textarea({ rows = 3, style, ...rest }) {
  return (
    <textarea
      rows={rows}
      style={{
        ...controlStyle,
        fontFamily: "inherit",
        lineHeight: "var(--lh-body)",
        resize: "vertical",
        ...style,
      }}
      {...rest}
    />
  );
}
return { controlStyle, Input, Textarea };
})();

/* ---------- forms/Select ---------- */
const { Select } = (function () {
/** Display-only select surface (prototype pattern) or a real <select> when onChange is given. */
function Select({ value, options, onChange, name, id, style }) {
  if (onChange) {
    return (
      <div style={{ position: "relative", ...style }}>
        <select
          id={id} name={name} value={value} onChange={onChange}
          style={{ ...controlStyle, appearance: "none", paddingRight: 38, cursor: "pointer" }}
        >
          {(options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <span style={{ position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)", color: "var(--faint)", pointerEvents: "none" }}>
          <Icon name="chevronDown" size={16} />
        </span>
      </div>
    );
  }
  return (
    <div style={{ ...controlStyle, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", ...style }}>
      <span>{value}</span>
      <Icon name="chevronDown" size={16} style={{ color: "var(--faint)" }} />
    </div>
  );
}
return { Select };
})();

/* ---------- forms/CheckboxRow ---------- */
const { CheckboxRow } = (function () {
/** Checkbox + icon + title + description, as used for Nizam course settings. */
function CheckboxRow({ checked = false, icon, title, description, onChange, style }) {
  return (
    <label style={{
      display: "flex", gap: 12, cursor: "pointer",
      border: "1px solid var(--line)", borderRadius: "var(--r-11)",
      padding: 16, ...style,
    }}>
      <span
        role="checkbox" aria-checked={checked}
        onClick={onChange}
        style={{
          width: 20, height: 20, flexShrink: 0, marginTop: 2,
          borderRadius: "var(--r-3)",
          border: checked ? "none" : "1.5px solid var(--border)",
          background: checked ? "var(--action-primary)" : "transparent",
          color: "var(--text-inverse)",
          display: "grid", placeItems: "center",
        }}
      >
        {checked && (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 12 5 5L20 6" />
          </svg>
        )}
      </span>
      <span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          {icon && <span style={{ color: "var(--ink)", display: "flex" }}>{icon}</span>}
          <span style={{ font: "var(--fw-semibold) var(--fs-15)/1.3 var(--font-ui)", color: "var(--ink)" }}>{title}</span>
        </span>
        {description && (
          <span style={{ display: "block", font: "var(--fw-regular) var(--fs-13-5)/var(--lh-body) var(--font-ui)", color: "var(--muted)" }}>
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
return { CheckboxRow };
})();

/* ---------- navigation/Breadcrumb ---------- */
const { Breadcrumb } = (function () {
function Breadcrumb({ items = [], size = "md", style }) {
  const fs = size === "sm" ? "var(--fs-13)" : "var(--fs-15)";
  return (
    <nav style={{ display: "flex", alignItems: "center", gap: 9, ...style }}>
      {items.map((it, i) => {
        const last = i === items.length - 1;
        const label = typeof it === "string" ? it : it.label;
        const href = typeof it === "string" ? undefined : it.href;
        const node = (
          <span style={{
            font: `${last ? "var(--fw-medium)" : "var(--fw-regular)"} ${fs}/1.3 var(--font-ui)`,
            color: last ? "var(--ink)" : "var(--muted)",
          }}>{label}</span>
        );
        return (
          <React.Fragment key={i}>
            {i > 0 && <Icon name="chevronRight" size={size === "sm" ? 13 : 15} style={{ color: "var(--faint)" }} />}
            {href && !last ? <a href={href} style={{ textDecoration: "none" }}>{node}</a> : node}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
return { Breadcrumb };
})();

/* ---------- navigation/Tabs ---------- */
const { Tabs } = (function () {
function Tabs({ items = [], value, onChange, underline = "accent", size = "md", style }) {
  const fs = size === "sm" ? "var(--fs-13)" : "var(--fs-14)";
  const lineColor = underline === "green" ? "var(--green)" : underline === "ink" ? "var(--ink)" : "var(--accent)";
  return (
    <div style={{ display: "flex", gap: 26, borderBottom: "1px solid var(--line)", ...style }}>
      {items.map((it) => {
        const id = typeof it === "string" ? it : it.id;
        const label = typeof it === "string" ? it : it.label;
        const badge = typeof it === "string" ? undefined : it.badge;
        const on = value === id;
        return (
          <button
            key={id} onClick={() => onChange?.(id)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              background: "none", border: "none", cursor: "pointer",
              padding: "0 2px 12px",
              borderBottom: `2px solid ${on ? lineColor : "transparent"}`,
              font: `${on ? "var(--fw-semibold)" : "var(--fw-medium)"} ${fs}/1.3 var(--font-ui)`,
              color: on ? "var(--ink)" : "var(--muted)",
            }}
          >
            {label}
            {badge !== undefined && (
              <span style={{
                font: "var(--fw-semibold) var(--fs-11-5)/1 var(--font-ui)",
                padding: "2px 7px", borderRadius: "var(--r-pill)",
                background: on ? (underline === "green" ? "var(--success-bg)" : "var(--accent-soft)") : "var(--surface-sunken)",
                color: on ? (underline === "green" ? "var(--success-fg)" : "var(--accent)") : "var(--muted)",
              }}>{badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
return { Tabs };
})();

/* ---------- navigation/SidebarItem ---------- */
const { SidebarItem } = (function () {
function SidebarItem({ icon, label, active = false, trailing, collapsed = false, style, ...rest }) {
  return (
    <div
      role="button"
      style={{
        display: "flex", alignItems: "center",
        gap: collapsed ? 0 : 12,
        justifyContent: collapsed ? "center" : undefined,
        padding: collapsed ? 0 : "10px 12px",
        width: collapsed ? 42 : undefined,
        height: collapsed ? 42 : undefined,
        borderRadius: collapsed ? "var(--r-9)" : "var(--r-7)",
        background: active ? "var(--nav-active)" : "transparent",
        color: active ? "var(--ink)" : "var(--slate-600)",
        font: `${active ? "var(--fw-semibold)" : "var(--fw-medium)"} var(--fs-15)/1.3 var(--font-ui)`,
        cursor: "pointer",
        transition: "var(--transition-hover)",
        ...style,
      }}
      {...rest}
    >
      {icon && <span style={{ color: active ? "var(--ink)" : "var(--slate-500)", display: "flex" }}>{icon}</span>}
      {!collapsed && label}
      {!collapsed && trailing && <span style={{ marginLeft: "auto" }}>{trailing}</span>}
    </div>
  );
}
return { SidebarItem };
})();

/* ---------- data/DataTable ---------- */
const { DataTable } = (function () {
/** Dense hairline table — the Nizam list pattern (desteler, köşkler, talebeler). */
function DataTable({ columns = [], rows = [], rowKey, empty = "Kayıt yok.", style }) {
  const template = columns.map((c) => c.width ?? "1fr").join(" ");
  return (
    <div style={{
      border: "1px solid var(--line)", borderRadius: "var(--r-10)",
      overflow: "hidden", ...style,
    }}>
      <div style={{
        display: "grid", gridTemplateColumns: template,
        padding: "11px 18px", background: "var(--surface-table-head)",
        borderBottom: "1px solid var(--line)",
        font: "var(--fw-semibold) var(--fs-12-5)/1.3 var(--font-ui)", color: "var(--muted)",
      }}>
        {columns.map((c, i) => (
          <div key={i} style={{ textAlign: c.align ?? "left" }}>{c.header}</div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "22px 18px", font: "var(--fw-regular) var(--fs-14)/1.4 var(--font-ui)", color: "var(--muted)" }}>
          {empty}
        </div>
      ) : (
        rows.map((row, r) => (
          <div
            key={rowKey ? rowKey(row, r) : r}
            style={{
              display: "grid", gridTemplateColumns: template,
              padding: "13px 18px", alignItems: "center",
              borderBottom: r < rows.length - 1 ? "1px solid var(--line-soft)" : "none",
              font: "var(--fw-regular) var(--fs-14)/1.4 var(--font-ui)", color: "var(--ink)",
            }}
          >
            {columns.map((c, i) => (
              <div key={i} style={{
                textAlign: c.align ?? "left",
                display: c.align === "right" ? "flex" : undefined,
                justifyContent: c.align === "right" ? "flex-end" : undefined,
                gap: c.align === "right" ? 6 : undefined,
                color: c.muted ? "var(--muted)" : undefined,
                fontWeight: c.strong ? "var(--fw-semibold)" : undefined,
                minWidth: 0,
              }}>
                {c.cell ? c.cell(row, r) : row[c.key]}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
return { DataTable };
})();

/* ---------- data/WeekAccordion ---------- */
const { WeekAccordion } = (function () {
const STATE_ICON = { done: "check", locked: "lock" };

/** One week of a müfredat: status medallion, title, meta, and a disclosure body. */
function WeekAccordion({
  week, title, state = "default", summary, meta, open = false, onToggle, children, style,
}) {
  const done = state === "done";
  const active = state === "active";
  const locked = state === "locked";

  return (
    <div style={{
      border: `1px solid ${active ? "#cbd5e1" : "var(--line)"}`,
      borderRadius: "var(--r-10)", overflow: "hidden",
      background: "var(--surface)", opacity: locked ? 0.85 : 1, ...style,
    }}>
      <div
        onClick={locked ? undefined : onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "14px 16px", cursor: locked ? "default" : "pointer",
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: "var(--r-pill)", flexShrink: 0,
          display: "grid", placeItems: "center",
          background: done ? "var(--success)" : active ? "var(--action-primary)" : "var(--surface)",
          border: locked ? "1.5px dashed var(--border)" : "none",
          color: locked ? "var(--faint)" : "var(--text-inverse)",
          font: "var(--fw-semibold) var(--fs-11)/1 var(--font-ui)",
        }}>
          {done || locked ? <Icon name={STATE_ICON[state]} size={done ? 14 : 12} /> : week}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{
              font: "var(--fw-semibold) var(--fs-11)/1 var(--font-ui)",
              letterSpacing: "var(--tracking-eyebrow)", textTransform: "uppercase", color: "var(--muted)",
            }}>Hafta {week}</span>
            {active && <Badge tone="accent">Devam ediyor</Badge>}
            {done && <Badge tone="success">Tamamlandı</Badge>}
          </div>
          <div style={{
            font: "var(--fw-semibold) var(--fs-14)/1.3 var(--font-ui)",
            color: locked ? "var(--muted)" : "var(--ink)",
          }}>{title}</div>
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          font: "var(--fw-regular) var(--fs-12)/1 var(--font-ui)", color: "var(--muted)",
        }}>
          {meta}
          {!locked && (
            <Icon name="chevronDown" size={14}
              style={{ transform: open ? "none" : "rotate(-90deg)", transition: "var(--transition-disclosure)" }} />
          )}
        </div>
      </div>

      {open && !locked && (
        <div style={{ borderTop: "1px solid var(--line-soft)", padding: "6px 0" }}>
          {summary && (
            <div style={{
              padding: "8px 16px 4px 58px",
              font: `var(--fw-regular) var(--fs-12)/var(--lh-body) var(--font-ui)`, color: "var(--muted)",
            }}>{summary}</div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
return { WeekAccordion };
})();

/* ---------- data/LessonRow ---------- */
const { LessonRow } = (function () {
const TYPES = {
  video: { label: "Video", icon: "playCircle", color: "var(--type-video)", bg: "var(--accent-soft)" },
  doc:   { label: "Doküman", icon: "pdf", color: "var(--type-doc)", bg: "var(--surface-sunken)" },
  live:  { label: "Canlı halka", icon: "headset", color: "var(--type-live)", bg: "var(--danger-bg)" },
  quiz:  { label: "Sınav", icon: "quiz", color: "var(--type-quiz)", bg: "var(--warning-bg)" },
};

function LessonRow({
  title, type = "video", duration, source, typeLabel,
  done = false, current = false, indent = 58, trailing, style,
}) {
  const t = TYPES[type] ?? TYPES.video;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "8px 16px",
      paddingLeft: current ? indent - 2 : indent,
      background: current ? "rgba(29, 78, 216, 0.04)" : "transparent",
      borderLeft: current ? "2px solid var(--accent)" : "2px solid transparent",
      ...style,
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: "var(--r-pill)", flexShrink: 0,
        display: "grid", placeItems: "center",
        background: done ? "var(--success-bg)" : current ? "var(--accent-soft)" : t.bg,
        color: done ? "var(--success)" : current ? "var(--accent)" : t.color,
      }}>
        <Icon name={done ? "check" : t.icon} size={13} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          font: `${current ? "var(--fw-semibold)" : "var(--fw-medium)"} var(--fs-13)/1.35 var(--font-ui)`,
          color: done ? "var(--muted)" : "var(--ink)",
          textDecoration: done ? "line-through" : "none",
          textDecorationColor: "rgba(100,116,139,.4)",
        }}>{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
          <span style={{ font: "var(--fw-regular) var(--fs-11)/1 var(--font-ui)", color: "var(--muted)" }}>
            {typeLabel ?? t.label}
          </span>
          {source && (
            <>
              <span style={{ width: 2, height: 2, borderRadius: "var(--r-pill)", background: "var(--faint)" }} />
              <span style={{ font: "var(--fw-regular) var(--fs-11)/1 var(--font-ui)", color: "var(--accent)" }}>{source}</span>
            </>
          )}
        </div>
      </div>

      {trailing}
      {duration && (
        <span style={{
          font: "var(--fw-regular) var(--fs-12)/1 var(--font-ui)", color: "var(--muted)",
          minWidth: 56, textAlign: "right",
        }}>{duration}</span>
      )}
    </div>
  );
}
return { LessonRow };
})();

/* ---------- feedback/Dialog ---------- */
const { Dialog } = (function () {
/**
 * Centered modal. Pass contained when rendering inside a fixed-size frame
 * (canvas artboard, embedded preview) so the scrim stays inside its container.
 */
function Dialog({
  open = true, onClose, eyebrow, title, headerExtra, actions,
  width = 960, contained = false, children, style,
}) {
  if (!open) return null;
  return (
    <div
      role="dialog" aria-modal="true" onClick={onClose}
      style={{
        position: contained ? "absolute" : "fixed", inset: 0, zIndex: 100,
        background: "var(--scrim-dialog)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: contained ? "flex-start" : "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)", borderRadius: "var(--r-14)",
          width: `min(${width}px, 100%)`,
          maxHeight: contained ? "calc(100% - 48px)" : "92vh",
          marginTop: contained ? 60 : 0,
          display: "flex", flexDirection: "column",
          boxShadow: "var(--shadow-dialog)",
          ...style,
        }}
      >
        <div style={{ padding: "20px 24px 18px", borderBottom: "1px solid var(--line-soft)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div>
              {eyebrow && (
                <div style={{
                  font: "var(--fw-semibold) var(--fs-11)/1 var(--font-ui)",
                  letterSpacing: "var(--tracking-eyebrow)", textTransform: "uppercase",
                  color: "var(--muted)", marginBottom: 4,
                }}>{eyebrow}</div>
              )}
              {title && (
                <h2 style={{
                  margin: 0, font: "var(--fw-bold) var(--fs-22)/1.2 var(--font-ui)",
                  letterSpacing: "var(--tracking-heading)", color: "var(--ink)",
                }}>{title}</h2>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              {headerExtra}
              {onClose && (
                <button
                  onClick={onClose} aria-label="Kapat"
                  style={{
                    background: "var(--surface-alt)", border: "none", borderRadius: "var(--r-6)",
                    padding: 8, cursor: "pointer", color: "var(--ink)", display: "flex",
                  }}
                >
                  <Icon name="close" size={18} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "16px 24px 24px", flex: 1 }}>{children}</div>

        {actions && (
          <div style={{
            borderTop: "1px solid var(--line-soft)", padding: "14px 24px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          }}>{actions}</div>
        )}
      </div>
    </div>
  );
}
return { Dialog };
})();

/* ---------- feedback/Toast ---------- */
const { Toast } = (function () {
const TONES = {
  success: { icon: "check", color: "var(--success)", bg: "var(--success-bg)" },
  info:    { icon: "bell", color: "var(--accent)", bg: "var(--accent-soft)" },
  danger:  { icon: "close", color: "var(--danger)", bg: "var(--danger-bg)" },
};

function Toast({ tone = "success", title, description, action, anchored = true, style }) {
  const t = TONES[tone];
  return (
    <div
      role="status"
      style={{
        display: "flex", alignItems: "center", gap: 12,
        background: "var(--surface)", border: "1px solid var(--line)",
        borderRadius: "var(--r-10)", padding: "14px 18px",
        boxShadow: "var(--shadow-toast)",
        ...(anchored ? { position: "absolute", right: 28, bottom: 24 } : null),
        ...style,
      }}
    >
      <span style={{
        width: 28, height: 28, borderRadius: "var(--r-pill)", flexShrink: 0,
        display: "grid", placeItems: "center", background: t.bg, color: t.color,
      }}>
        <Icon name={t.icon} size={15} />
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ font: "var(--fw-semibold) var(--fs-14)/1.3 var(--font-ui)", color: "var(--ink)" }}>{title}</div>
        {description && (
          <div style={{ font: "var(--fw-regular) var(--fs-13)/1.4 var(--font-ui)", color: "var(--muted)", marginTop: 1 }}>
            {description}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}
return { Toast };
})();

window.MadrasahDS = { Icon, ICON_NAMES, FILLED_ICON_NAMES, Logo, CoverPattern, Button, IconButton, Badge, Pill, Avatar, AvatarStack, Card, ProgressBar, ProgressRing, Field, controlStyle, Input, Textarea, Select, CheckboxRow, Breadcrumb, Tabs, SidebarItem, DataTable, WeekAccordion, LessonRow, Dialog, Toast };
Object.assign(window, window.MadrasahDS);
