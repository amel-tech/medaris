/* @ds-bundle: {"format":4,"namespace":"MedarisDesignSystem_628e07","components":[{"name":"Alert","sourcePath":"components/Alert.jsx"},{"name":"AppBar","sourcePath":"components/AppBar.jsx"},{"name":"Avatar","sourcePath":"components/Avatar.jsx"},{"name":"AvatarStack","sourcePath":"components/AvatarStack.jsx"},{"name":"Badge","sourcePath":"components/Badge.jsx"},{"name":"Breadcrumb","sourcePath":"components/Breadcrumb.jsx"},{"name":"Button","sourcePath":"components/Button.jsx"},{"name":"Card","sourcePath":"components/Card.jsx"},{"name":"Checkbox","sourcePath":"components/Checkbox.jsx"},{"name":"ChoiceChips","sourcePath":"components/ChoiceChips.jsx"},{"name":"CoverPattern","sourcePath":"components/CoverPattern.jsx"},{"name":"Dialog","sourcePath":"components/Dialog.jsx"},{"name":"EmptyState","sourcePath":"components/EmptyState.jsx"},{"name":"Field","sourcePath":"components/Field.jsx"},{"name":"Icon","sourcePath":"components/Icon.jsx"},{"name":"IconButton","sourcePath":"components/IconButton.jsx"},{"name":"Input","sourcePath":"components/Input.jsx"},{"name":"LessonRow","sourcePath":"components/LessonRow.jsx"},{"name":"Logo","sourcePath":"components/Logo.jsx"},{"name":"NavItem","sourcePath":"components/NavItem.jsx"},{"name":"NavSection","sourcePath":"components/NavSection.jsx"},{"name":"PlatformChip","sourcePath":"components/PlatformChip.jsx"},{"name":"Progress","sourcePath":"components/Progress.jsx"},{"name":"Radio","sourcePath":"components/Radio.jsx"},{"name":"RadioGroup","sourcePath":"components/RadioGroup.jsx"},{"name":"Select","sourcePath":"components/Select.jsx"},{"name":"SessionJoin","sourcePath":"components/SessionJoin.jsx"},{"name":"Skeleton","sourcePath":"components/Skeleton.jsx"},{"name":"Stat","sourcePath":"components/Stat.jsx"},{"name":"Switch","sourcePath":"components/Switch.jsx"},{"name":"SystemState","sourcePath":"components/SystemState.jsx"},{"name":"Table","sourcePath":"components/Table.jsx"},{"name":"Tabs","sourcePath":"components/Tabs.jsx"},{"name":"Textarea","sourcePath":"components/Textarea.jsx"},{"name":"Toast","sourcePath":"components/Toast.jsx"},{"name":"Toaster","sourcePath":"components/Toaster.jsx"},{"name":"Tooltip","sourcePath":"components/Tooltip.jsx"},{"name":"WeekAccordion","sourcePath":"components/WeekAccordion.jsx"}],"sourceHashes":{"components/Alert.jsx":"8633988c2e2b","components/AppBar.jsx":"712069fa6324","components/Avatar.jsx":"952016109c2f","components/AvatarStack.jsx":"60d5ce464bb2","components/Badge.jsx":"72e303c01321","components/Breadcrumb.jsx":"69b336a6d178","components/Button.jsx":"3c5e4929e2b4","components/Card.jsx":"9dd43ded8dc6","components/Checkbox.jsx":"e08fb979b6ab","components/ChoiceChips.jsx":"c9d91884c7cf","components/CoverPattern.jsx":"0bb303b137b6","components/Dialog.jsx":"3500d56e8e51","components/EmptyState.jsx":"119ed77cb382","components/Field.jsx":"d7f7542444d5","components/Icon.jsx":"c1fa9fa9eff1","components/IconButton.jsx":"eeac1138f1ce","components/Input.jsx":"5aa6af046c4a","components/LessonRow.jsx":"6d08e2580332","components/Logo.jsx":"d1cd154f91e3","components/NavItem.jsx":"740d42c27641","components/NavSection.jsx":"5aa3ea27fab6","components/PlatformChip.jsx":"7d6d6df7f58a","components/Progress.jsx":"24163caeef31","components/Radio.jsx":"5f0e7a362b5f","components/RadioGroup.jsx":"a14f1cee645e","components/Select.jsx":"aeedfba944c6","components/SessionJoin.jsx":"7afd500887aa","components/Skeleton.jsx":"2deb515d2820","components/Stat.jsx":"f7017d1e3f10","components/Switch.jsx":"6bbfe151f130","components/SystemState.jsx":"7b8361263958","components/Table.jsx":"526d7de65713","components/Tabs.jsx":"45fa51d35283","components/Textarea.jsx":"83d52d6476ff","components/Toast.jsx":"283a947c0728","components/Toaster.jsx":"9c3cbe6dddee","components/Tooltip.jsx":"e00aa51b7d26","components/WeekAccordion.jsx":"e1ed84ad9335"},"inlinedExternals":[],"unexposedExports":[{"name":"initials","sourcePath":"components/Avatar.jsx"},{"name":"coverTone","sourcePath":"components/CoverPattern.jsx"},{"name":"iconNames","sourcePath":"components/Icon.jsx"}]} */

(() => {

const __ds_ns = (window.MedarisDesignSystem_628e07 = window.MedarisDesignSystem_628e07 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/Alert.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* .mds-alert. The tone's glyph is a mask the class layer draws from the sprite (.mds-alert__icon),
   so this file draws no icon of its own. */
function Alert({
  tone = 'neutral',
  title,
  children,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['mds-alert', `mds-alert--${tone}`, className].filter(Boolean).join(' '),
    role: tone === 'error' ? 'alert' : 'status'
  }, rest), /*#__PURE__*/React.createElement("span", {
    className: "mds-alert__icon",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("div", null, title && /*#__PURE__*/React.createElement("p", {
    className: "mds-alert__title"
  }, title), children));
}
Object.assign(__ds_scope, { Alert });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Alert.jsx", error: String((e && e.message) || e) }); }

// components/AppBar.jsx
try { (() => {
// The sheet id must be unique per instance. React.useId where it exists; a
// module counter only for a React without it.
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `a${++seq}`)[0]);

/* Wraps .mds-appbar and its nav sheet: the compact chrome below 768. The caller passes
   the Logo and the NavItems; the sheet is a native modal <dialog>, so Esc, focus
   containment and the backdrop come from the browser. */
function AppBar({
  title,
  logo,
  menuLabel = 'Menü',
  navLabel = 'Ana menü',
  closeLabel = 'Kapat',
  actions,
  footer,
  children,
  className = ''
}) {
  const sheetId = `mds-sheet-${useUid().replace(/[^\w-]/g, '')}`;
  const menu = React.useRef(null);
  const sheet = React.useRef(null);
  const [open, setOpen] = React.useState(false);
  const show = () => {
    if (!sheet.current || !sheet.current.showModal) return;
    sheet.current.showModal();
    setOpen(true);
  };
  const hide = () => sheet.current && sheet.current.open && sheet.current.close();

  // Once the bar is not drawn (768 and up), an open sheet closes with it.
  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => {
      if (menu.current && menu.current.getClientRects().length === 0) hide();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // A click on the backdrop lands on the <dialog> itself; a followed link closes it too.
  const onSheetClick = e => {
    if (e.target === sheet.current || e.target.closest && e.target.closest('a[href]')) hide();
  };
  // Every way out (Esc, the close button, the backdrop, a link) ends here.
  const onClose = () => {
    setOpen(false);
    if (menu.current) menu.current.focus();
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("header", {
    className: ['mds-appbar', className].filter(Boolean).join(' ')
  }, /*#__PURE__*/React.createElement("button", {
    ref: menu,
    type: "button",
    className: "mds-btn mds-icon-btn mds-btn--large mds-btn--ghost mds-appbar__menu",
    "aria-label": menuLabel,
    "aria-haspopup": "dialog",
    "aria-expanded": open,
    "aria-controls": sheetId,
    onClick: show
  }, /*#__PURE__*/React.createElement("span", {
    className: "mds-appbar__menu-icon",
    "aria-hidden": "true"
  })), logo, /*#__PURE__*/React.createElement("p", {
    className: "mds-appbar__title",
    dir: "auto"
  }, title), actions && /*#__PURE__*/React.createElement("div", {
    className: "mds-appbar__actions"
  }, actions)), /*#__PURE__*/React.createElement("dialog", {
    ref: sheet,
    id: sheetId,
    className: "mds-sheet",
    "aria-label": navLabel,
    onClose: onClose,
    onClick: onSheetClick
  }, /*#__PURE__*/React.createElement("div", {
    className: "mds-sheet__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mds-sheet__head"
  }, logo, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "mds-btn mds-icon-btn mds-btn--regular mds-btn--ghost mds-sheet__close",
    "aria-label": closeLabel,
    onClick: hide
  }, /*#__PURE__*/React.createElement("span", {
    className: "mds-sheet__close-icon",
    "aria-hidden": "true"
  }))), /*#__PURE__*/React.createElement("nav", {
    "aria-label": navLabel
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    className: "mds-sheet__foot"
  }, footer))));
}
Object.assign(__ds_scope, { AppBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/AppBar.jsx", error: String((e && e.message) || e) }); }

// components/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Lower-case name particles that take no letter: "Ahmed b. Hanbel" → AH.
const particles = new Set(['b.', 'bin', 'ibn', 'bt.', 'bint']);
// Honorifics after the name take no letter either: "İsmail Hakkı Efendi" → İH.
const honorifics = new Set(['Efendi', 'Bey', 'Hanım', 'Hoca']);

/** Initials: the first letters of the first and the last word that is not a particle or an
    honorific, upper-cased in the page's locale (tr-TR: i becomes İ). A double given name keeps
    the surname: "Zeynep Kübra Demirci" → ZD. */
function initials(name = '', locale = 'tr-TR') {
  const words = name.normalize('NFC').trim().split(/\s+/).filter(w => w && !particles.has(w) && !honorifics.has(w));
  const letters = (words.length > 1 ? [words[0], words[words.length - 1]] : words).map(w => Array.from(w)[0]).join('');
  try {
    return letters.toLocaleUpperCase(locale);
  } catch (e) {
    return letters.toLocaleUpperCase('tr-TR');
  }
}

// The page's locale (MDS-NUM-01): the locale prop, else the nearest lang once mounted, else tr-TR.
function usePageLocale(ref, locale) {
  const [found, setFound] = React.useState(null);
  React.useEffect(() => {
    const el = ref.current && ref.current.closest('[lang]');
    setFound(el && el.lang || null);
  }, []);
  return locale || found || 'tr-TR';
}
const arabicScript = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const arabicPage = /^(ar|ota-arab|fa|ur)\b/i;
function Avatar({
  name,
  src,
  size = 'md',
  decorative = false,
  entity = false,
  locale,
  className = '',
  ...rest
}) {
  const ref = React.useRef(null);
  const lang = usePageLocale(ref, locale);
  const cls = ['mds-avatar', size !== 'md' && `mds-avatar--${size}`, entity && 'mds-avatar--entity', className].filter(Boolean).join(' ');
  // Standalone, the avatar is an image named by the person; beside the printed name it is hidden.
  const a11y = decorative || !name ? {
    'aria-hidden': 'true'
  } : {
    role: 'img',
    'aria-label': name
  };
  // A Latin-script name on an Arabic-script page is a Latin island (MDS-TYPE-07): its initials keep the Latin face.
  const island = name && !arabicScript.test(name) && arabicPage.test(lang) ? 'tr' : undefined;
  return /*#__PURE__*/React.createElement("span", _extends({
    ref: ref,
    className: cls,
    lang: island
  }, a11y, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: ""
  }) : initials(name, island || lang));
}
Object.assign(__ds_scope, { initials, Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/AvatarStack.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Avatar's initials, repeated here because a component file stands alone (MDS-COMP-06).
const particles = new Set(['b.', 'bin', 'ibn', 'bt.', 'bint']);
// Honorifics after the name take no letter either: "İsmail Hakkı Efendi" → İH.
const honorifics = new Set(['Efendi', 'Bey', 'Hanım', 'Hoca']);
function initials(name = '', locale = 'tr-TR') {
  const words = name.normalize('NFC').trim().split(/\s+/).filter(w => w && !particles.has(w) && !honorifics.has(w));
  const letters = (words.length > 1 ? [words[0], words[words.length - 1]] : words).map(w => Array.from(w)[0]).join('');
  try {
    return letters.toLocaleUpperCase(locale);
  } catch (e) {
    return letters.toLocaleUpperCase('tr-TR');
  }
}

// The page's locale (MDS-NUM-01): the locale prop, else the nearest lang once mounted, else tr-TR.
function usePageLocale(ref, locale) {
  const [found, setFound] = React.useState(null);
  React.useEffect(() => {
    const el = ref.current && ref.current.closest('[lang]');
    setFound(el && el.lang || null);
  }, []);
  return locale || found || 'tr-TR';
}

/* Small overlapping avatars, drawn as .mds-avatar markup (it cannot use Avatar, MDS-COMP-06), and a
   last tile counting the rest: +N = total − shown. With a label the stack is a named group. */
function AvatarStack({
  people = [],
  max = 3,
  total,
  label,
  locale,
  className = ''
}) {
  const ref = React.useRef(null);
  const lang = usePageLocale(ref, locale);
  const shown = people.slice(0, Math.max(0, max));
  const more = Math.max(0, (total != null ? total : people.length) - shown.length);
  let count = String(more);
  try {
    count = new Intl.NumberFormat(lang).format(more);
  } catch (e) {/* keep the digits */}
  return /*#__PURE__*/React.createElement("span", _extends({
    ref: ref,
    className: ['mds-avatar-stack', className].filter(Boolean).join(' ')
  }, label ? {
    role: 'group',
    'aria-label': label
  } : {}), shown.map((p, i) => /*#__PURE__*/React.createElement("span", _extends({
    key: i,
    className: "mds-avatar mds-avatar--sm"
  }, p.name ? {
    role: 'img',
    'aria-label': p.name
  } : {
    'aria-hidden': 'true'
  }), p.src ? /*#__PURE__*/React.createElement("img", {
    src: p.src,
    alt: ""
  }) : initials(p.name, lang))), more > 0 && /*#__PURE__*/React.createElement("span", {
    className: "mds-avatar mds-avatar--sm mds-avatar--more",
    "aria-hidden": label ? 'true' : undefined
  }, "+", count));
}
Object.assign(__ds_scope, { AvatarStack });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/AvatarStack.jsx", error: String((e && e.message) || e) }); }

// components/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Badge({
  children,
  variant = 'secondary',
  icon,
  dot = false,
  className = '',
  ...rest
}) {
  const cls = ['mds-badge', `mds-badge--${variant}`, className].filter(Boolean).join(' ');
  // The live-now state always carries its dot beside the words (MDS-COL-03).
  const showDot = dot || variant === 'live';
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls
  }, rest), showDot && /*#__PURE__*/React.createElement("span", {
    className: "mds-badge__dot",
    "aria-hidden": "true"
  }), icon, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Badge.jsx", error: String((e && e.message) || e) }); }

// components/Breadcrumb.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Wraps .mds-breadcrumb: where the URL already is, root first. The last item is the
   current page and never a link; below 768 only its parent shows, as a back link.
   With no parent there is nothing to show, so no landmark is rendered. */
function Breadcrumb({
  items = [],
  label = 'Sayfa yolu',
  className = '',
  ...rest
}) {
  if (items.length < 2) return null;
  const last = items.length - 1;
  return /*#__PURE__*/React.createElement("nav", _extends({
    className: ['mds-breadcrumb', className].filter(Boolean).join(' '),
    "aria-label": label
  }, rest), /*#__PURE__*/React.createElement("ol", {
    className: "mds-breadcrumb__list"
  }, items.map((item, i) => {
    const {
      label: text,
      href
    } = typeof item === 'string' ? {
      label: item
    } : item;
    let node;
    if (i === last) {
      node = /*#__PURE__*/React.createElement("span", {
        className: "mds-breadcrumb__current",
        "aria-current": "page"
      }, /*#__PURE__*/React.createElement("bdi", null, text));
    } else if (href) {
      node = /*#__PURE__*/React.createElement("a", {
        className: "mds-breadcrumb__link",
        href: href
      }, i === last - 1 && /*#__PURE__*/React.createElement("span", {
        className: "mds-breadcrumb__back",
        "aria-hidden": "true"
      }), /*#__PURE__*/React.createElement("bdi", null, text));
    } else {
      node = /*#__PURE__*/React.createElement("span", {
        className: "mds-breadcrumb__text"
      }, /*#__PURE__*/React.createElement("bdi", null, text));
    }
    return /*#__PURE__*/React.createElement("li", {
      key: i,
      className: "mds-breadcrumb__item"
    }, node, i < last && /*#__PURE__*/React.createElement("span", {
      className: "mds-breadcrumb__sep",
      "aria-hidden": "true"
    }, "/"));
  })));
}
Object.assign(__ds_scope, { Breadcrumb });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Breadcrumb.jsx", error: String((e && e.message) || e) }); }

// components/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Wraps .mds-btn from components.css. Every size and fill lives in CSS so a
   prototype and production code cannot drift apart. */
function Button({
  children,
  variant = 'primary',
  size = 'regular',
  iconLeft,
  iconRight,
  href,
  fullWidth = false,
  loading,
  loadingLabel = 'Yükleniyor',
  disabled,
  className = '',
  onClick,
  onKeyDown,
  ...rest
}) {
  const busy = Boolean(loading);
  const cls = ['mds-btn', `mds-btn--${size}`, `mds-btn--${variant}`, fullWidth && 'mds-btn--full', className].filter(Boolean).join(' ');

  // A disabled link loses its href, so role="link" keeps it a link; a busy one keeps href and focus.
  const off = href !== undefined && Boolean(disabled) && !busy;
  // Busy, or a disabled link: a click or Enter/Space does nothing (MDS-A11Y-11).
  // pointer-events alone would not stop the keyboard, so a busy submit could fire twice.
  const click = e => {
    if (busy || off) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (onClick) onClick(e);
  };
  const keyDown = e => {
    if ((busy || off) && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (onKeyDown) onKeyDown(e);
  };
  const content = /*#__PURE__*/React.createElement(React.Fragment, null, busy ? /*#__PURE__*/React.createElement("span", {
    className: "mds-btn__spinner",
    "aria-hidden": "true"
  }) : iconLeft, children, iconRight);
  // aria-busy is not announced on a button, so a status region beside it speaks instead. It is
  // rendered whenever the caller drives `loading`, so it is in the page before it has to speak.
  const status = loading !== undefined && /*#__PURE__*/React.createElement("span", {
    className: "mds-visually-hidden",
    role: "status"
  }, busy ? loadingLabel : '');
  if (href !== undefined) {
    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("a", _extends({
      className: cls,
      href: off ? undefined : href,
      role: off ? 'link' : undefined,
      "aria-disabled": off || busy ? 'true' : undefined,
      "aria-busy": busy ? 'true' : undefined,
      onClick: click,
      onKeyDown: keyDown
    }, rest), content), status);
  }
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: cls,
    disabled: disabled,
    "aria-disabled": busy ? 'true' : undefined,
    "aria-busy": busy ? 'true' : undefined,
    onClick: click,
    onKeyDown: keyDown
  }, rest), content), status);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Button.jsx", error: String((e && e.message) || e) }); }

// components/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* .mds-card. A clickable card is one link, in its title (href): the link's ::after covers the card,
   so it is one tab stop and the buttons inside it still work. */
function Card({
  title,
  action,
  headingLevel = 3,
  media,
  footer,
  href,
  density = 'regular',
  children,
  className = '',
  ...rest
}) {
  const Heading = `h${[2, 3, 4].includes(headingLevel) ? headingLevel : 3}`;
  const interactive = Boolean(href && title);
  const cls = ['mds-card', interactive && 'mds-card--interactive', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("div", _extends({
    className: cls,
    "data-density": density === 'compact' ? 'compact' : undefined
  }, rest), media && /*#__PURE__*/React.createElement("div", {
    className: "mds-card__media"
  }, media), (title || action) && /*#__PURE__*/React.createElement("div", {
    className: "mds-card__header"
  }, title && /*#__PURE__*/React.createElement(Heading, {
    className: "mds-card__title",
    dir: "auto"
  }, interactive ? /*#__PURE__*/React.createElement("a", {
    className: "mds-card__link",
    href: href
  }, title) : title), action), children, footer && /*#__PURE__*/React.createElement("div", {
    className: "mds-card__footer"
  }, footer));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Card.jsx", error: String((e && e.message) || e) }); }

// components/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `c${++seq}`)[0]);

/* A native checkbox inside its own <label class="mds-choice">, which is the 24px
   hit area. Native attributes, aria-* included, go to the <input>; className goes
   to the label. The input is named by the label span alone (aria-labelledby), since
   the wrapping <label> would add the description to its name; the description
   is wired with aria-describedby. */
function Checkbox({
  label,
  description,
  icon,
  bordered = false,
  className = '',
  ...rest
}) {
  const uid = useUid().replace(/[^\w-]/g, '');
  const labelId = `mds-choice-${uid}-l`;
  const descId = `mds-choice-${uid}-d`;
  const labelledBy = [rest['aria-labelledby'], labelId].filter(Boolean).join(' ');
  const describedBy = [rest['aria-describedby'], description && descId].filter(Boolean).join(' ') || undefined;
  const cls = ['mds-choice', bordered && 'mds-choice--bordered', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("label", {
    className: cls
  }, /*#__PURE__*/React.createElement("input", _extends({}, rest, {
    type: "checkbox",
    className: "mds-check",
    "aria-labelledby": labelledBy,
    "aria-describedby": describedBy
  })), icon && /*#__PURE__*/React.createElement("span", {
    className: "mds-choice__icon",
    "aria-hidden": "true"
  }, icon), /*#__PURE__*/React.createElement("span", {
    className: "mds-choice__text"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mds-choice__label",
    id: labelId
  }, label), description && /*#__PURE__*/React.createElement("span", {
    className: "mds-choice__desc",
    id: descId
  }, description)));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/ChoiceChips.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* A <fieldset> of chips: native radios (one choice) or, with `multiple`, native
   checkboxes (any number). Arrow keys, exclusivity, form submission and the
   checked state come from the inputs. Controlled with `value`, uncontrolled with
   `defaultValue`; with `multiple`, onChange receives every checked value in
   option order. */
function ChoiceChips({
  legend,
  name,
  legendVisible = false,
  options = [],
  multiple = false,
  value,
  defaultValue,
  onChange,
  className = ''
}) {
  const has = (v, x) => Array.isArray(v) ? v.includes(x) : v === x;
  const change = e => {
    if (!onChange) return;
    if (!multiple) return onChange(e.target.value, e);
    const inputs = e.currentTarget.closest('fieldset').querySelectorAll('input:checked');
    onChange(Array.from(inputs, i => i.value), e);
  };
  return /*#__PURE__*/React.createElement("fieldset", {
    className: ['mds-chips', className].filter(Boolean).join(' ')
  }, /*#__PURE__*/React.createElement("legend", {
    className: legendVisible ? 'mds-label' : 'mds-visually-hidden'
  }, legend), options.map(o => {
    const state = value !== undefined ? {
      checked: has(value, o.value)
    } : {
      defaultChecked: has(defaultValue, o.value)
    };
    return /*#__PURE__*/React.createElement("label", {
      key: o.value,
      className: "mds-chip"
    }, /*#__PURE__*/React.createElement("input", _extends({
      type: multiple ? 'checkbox' : 'radio',
      name: name,
      value: o.value,
      disabled: o.disabled,
      onChange: change
    }, state)), o.icon, o.label);
  }));
}
Object.assign(__ds_scope, { ChoiceChips });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/ChoiceChips.jsx", error: String((e && e.message) || e) }); }

// components/CoverPattern.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// The hash order. Changing it re-colours every course that has no chosen tone.
const tones = ['laciverd', 'bordo', 'zumrut', 'murekkep'];
const arabicScript = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/** The tone a seed hashes to: FNV-1a 32-bit over its UTF-8 bytes, mod 4. Lone surrogates count
 *  as U+FFFD, as TextEncoder encodes them, so every platform gets the same tone. */
function coverTone(seed = '') {
  let h = 2166136261;
  for (const ch of String(seed)) {
    let c = ch.codePointAt(0);
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    const bytes = c < 0x80 ? [c] : c < 0x800 ? [0xc0 | c >> 6, 0x80 | c & 63] : c < 0x10000 ? [0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63] : [0xf0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63];
    for (const b of bytes) h = Math.imul(h ^ b, 16777619);
  }
  return tones[(h >>> 0) % 4];
}
function CoverPattern({
  tone,
  seed,
  size = 'md',
  label,
  labelLang,
  className = '',
  ...rest
}) {
  const t = tones.includes(tone) ? tone : seed != null && seed !== '' ? coverTone(seed) : 'murekkep';
  const cls = ['mds-cover', `mds-cover--${t}`, size !== 'md' && `mds-cover--${size}`, className].filter(Boolean).join(' ');
  // An Arabic label needs lang="ar" on itself: that sets it in Naskh (MDS-TYPE-04).
  const lang = labelLang ?? (label && arabicScript.test(label) ? 'ar' : undefined);
  return /*#__PURE__*/React.createElement("div", _extends({
    className: cls
  }, rest), label && size !== 'xs' && /*#__PURE__*/React.createElement("p", {
    className: "mds-eyebrow mds-cover__label",
    lang: lang,
    dir: lang === 'ar' ? 'rtl' : 'auto'
  }, label));
}
Object.assign(__ds_scope, { coverTone, CoverPattern });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/CoverPattern.jsx", error: String((e && e.message) || e) }); }

// components/Dialog.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Ids must be unique per instance. React.useId where it exists; a module counter
// only for a React without it.
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `d${++seq}`)[0]);

// What takes focus when the dialog opens: the first footer button ("Vazgeç") in a
// confirmation, the first field in a form, the reading body of a non-form lg.
// Otherwise the browser's choice stands: the first header action, else the close button.
function initialFocus(dialog, kind, form, reading) {
  if (kind === 'alert') {
    return [...dialog.querySelectorAll('.mds-dialog__footer button')].find(b => !b.closest('.mds-dialog__meta'));
  }
  if (form) return dialog.querySelector('.mds-dialog__body :is(input:not([type="hidden"]), select, textarea)');
  if (reading) return dialog.querySelector('.mds-dialog__body');
  return null;
}

/* Wraps a native <dialog> opened with showModal(). Every close — a footer button in
   a form, Esc, the close button, the backdrop, or `open` turning false — goes through
   the element's own close event; onClose hears all but the last. */
function Dialog({
  open,
  onClose,
  title,
  eyebrow,
  kind = 'dialog',
  size = 'sm',
  headerActions,
  footer,
  footerMeta,
  form = false,
  dismissible,
  onCancel,
  closeLabel = 'Kapat',
  children,
  className = '',
  ...rest
}) {
  const ref = React.useRef(null);
  const opener = React.useRef(null);
  const quiet = React.useRef(false);
  const escaped = React.useRef(false);
  const pressedBackdrop = React.useRef(false);
  const uid = useUid().replace(/[^\w-]/g, '');
  const titleId = `mds-dialog-${uid}-t`;
  const bodyId = `mds-dialog-${uid}-b`;
  const reading = size === 'lg' && !form;
  const backdropCloses = dismissible ?? (kind === 'dialog' && !form);
  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog || typeof dialog.showModal !== 'function') return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      escaped.current = false;
      dialog.returnValue = '';
      dialog.showModal();
      initialFocus(dialog, kind, form, reading)?.focus();
    } else if (!open && dialog.open) {
      quiet.current = true;
      dialog.close();
    }
  }, [open]);

  // Unmounted while open: focus still goes back to the opener.
  React.useEffect(() => {
    const dialog = ref.current;
    return () => {
      if (dialog?.open) opener.current?.focus?.();
    };
  }, []);
  const handleClose = () => {
    const back = opener.current;
    if (back?.isConnected && typeof back.focus === 'function') back.focus();
    if (quiet.current) {
      quiet.current = false;
      return;
    }
    onClose?.(ref.current.returnValue || (escaped.current ? 'cancel' : undefined));
  };
  // Esc: the engine empties returnValue as it closes, so the cancel is remembered here.
  const handleCancel = event => {
    onCancel?.(event);
    escaped.current = !event.nativeEvent.defaultPrevented;
  };
  // A click on the <dialog> itself is a click on the backdrop; pressing inside the
  // panel and releasing outside it is not.
  const handlePointerDown = event => {
    pressedBackdrop.current = event.target === event.currentTarget;
  };
  // A footer button with value="cancel" ("Vazgeç") is type="button", so it never
  // submits: Enter in a field submits the one action, never the cancel.
  const handleClick = event => {
    if (event.target.closest?.('.mds-dialog__footer button[value="cancel"]:not(:disabled)')) {
      ref.current.close('cancel');
      return;
    }
    if (backdropCloses && pressedBackdrop.current && event.target === event.currentTarget) ref.current.close('cancel');
  };
  const Panel = form ? 'form' : 'div';
  const cls = ['mds-dialog', size !== 'sm' && `mds-dialog--${size}`, className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("dialog", _extends({}, rest, {
    ref: ref,
    className: cls,
    role: kind === 'alert' ? 'alertdialog' : undefined,
    "aria-labelledby": titleId,
    "aria-describedby": reading || form && kind !== 'alert' ? undefined : bodyId,
    onCancel: handleCancel,
    onClose: handleClose,
    onPointerDown: handlePointerDown,
    onClick: handleClick
  }), /*#__PURE__*/React.createElement(Panel, {
    className: "mds-dialog__panel",
    method: form ? 'dialog' : undefined
  }, /*#__PURE__*/React.createElement("div", {
    className: "mds-dialog__header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mds-dialog__heading"
  }, eyebrow && /*#__PURE__*/React.createElement("p", {
    className: "mds-eyebrow",
    dir: "auto"
  }, eyebrow), /*#__PURE__*/React.createElement("h2", {
    className: "mds-dialog__title",
    id: titleId,
    dir: "auto"
  }, title)), /*#__PURE__*/React.createElement("div", {
    className: "mds-dialog__actions"
  }, headerActions, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "mds-btn mds-icon-btn mds-btn--small mds-btn--ghost mds-dialog__close",
    "aria-label": closeLabel,
    onClick: () => ref.current?.close('cancel')
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mds-dialog__body",
    id: bodyId,
    role: reading ? 'region' : undefined,
    "aria-labelledby": reading ? titleId : undefined,
    tabIndex: reading ? 0 : undefined
  }, children), (footer || footerMeta) && /*#__PURE__*/React.createElement("div", {
    className: "mds-dialog__footer"
  }, footerMeta && /*#__PURE__*/React.createElement("p", {
    className: "mds-dialog__meta"
  }, footerMeta), footer)));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/EmptyState.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* A list or region with nothing in it: one sentence, an optional icon the caller
   passes, and at most one action. A page with nothing to show is a SystemState. */
function EmptyState({
  children,
  icon,
  action,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['mds-empty', className].filter(Boolean).join(' ')
  }, rest), icon && /*#__PURE__*/React.createElement("span", {
    className: "mds-empty__icon"
  }, icon), /*#__PURE__*/React.createElement("p", {
    className: "mds-empty__text"
  }, children), action);
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/Field.jsx
try { (() => {
// Ids must match on the server and the client: React.useId where it exists; a
// module counter only for a React without it.
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `f${++seq}`)[0]);

/* Label, one control, and a help or error line. The control keeps an id of its
   own if it has one; Field adds only what it knows, so a control's own
   aria-invalid or aria-describedby is never erased. */
function Field({
  label,
  help,
  error,
  required = false,
  children,
  className = ''
}) {
  const uid = useUid().replace(/[^\w-]/g, '');
  const control = React.isValidElement(children) ? children : null;
  const id = control && control.props.id || `mds-field-${uid}`;
  const noteId = `${id}-${error ? 'e' : 'h'}`;
  const note = error || help;
  const wired = {
    id
  };
  if (control) {
    const describedBy = [control.props['aria-describedby'], note && noteId].filter(Boolean).join(' ');
    if (describedBy) wired['aria-describedby'] = describedBy;
    if (error) wired['aria-invalid'] = true;
    if (required) {
      wired.required = true;
      wired['aria-required'] = true;
    }
  }
  return /*#__PURE__*/React.createElement("div", {
    className: ['mds-field', className].filter(Boolean).join(' ')
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "mds-label",
    htmlFor: control ? id : undefined
  }, label, required && /*#__PURE__*/React.createElement("span", {
    className: "mds-required",
    "aria-hidden": "true"
  }, "*")), control ? React.cloneElement(control, wired) : children, error ? /*#__PURE__*/React.createElement("span", {
    className: "mds-error",
    id: noteId
  }, error) : help ? /*#__PURE__*/React.createElement("span", {
    className: "mds-help",
    id: noteId
  }, help) : null);
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Field.jsx", error: String((e && e.message) || e) }); }

// components/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// BEGIN generated by tools/design-system/icons.mjs from assets/icons.svg; never edit by hand
const glyphs = {
  search: ['M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z'],
  bell: ['M221.8,175.94C216.25,166.38,208,139.33,208,104a80,80,0,1,0-160,0c0,35.34-8.26,62.38-13.81,71.94A16,16,0,0,0,48,200H88.81a40,40,0,0,0,78.38,0H208a16,16,0,0,0,13.8-24.06ZM128,216a24,24,0,0,1-22.62-16h45.24A24,24,0,0,1,128,216ZM48,184c7.7-13.24,16-43.92,16-80a64,64,0,1,1,128,0c0,36.05,8.28,66.73,16,80Z'],
  globe: ['M128,24h0A104,104,0,1,0,232,128,104.12,104.12,0,0,0,128,24Zm88,104a87.61,87.61,0,0,1-3.33,24H174.16a157.44,157.44,0,0,0,0-48h38.51A87.61,87.61,0,0,1,216,128ZM102,168H154a115.11,115.11,0,0,1-26,45A115.27,115.27,0,0,1,102,168Zm-3.9-16a140.84,140.84,0,0,1,0-48h59.88a140.84,140.84,0,0,1,0,48ZM40,128a87.61,87.61,0,0,1,3.33-24H81.84a157.44,157.44,0,0,0,0,48H43.33A87.61,87.61,0,0,1,40,128ZM154,88H102a115.11,115.11,0,0,1,26-45A115.27,115.27,0,0,1,154,88Zm52.33,0H170.71a135.28,135.28,0,0,0-22.3-45.6A88.29,88.29,0,0,1,206.37,88ZM107.59,42.4A135.28,135.28,0,0,0,85.29,88H49.63A88.29,88.29,0,0,1,107.59,42.4ZM49.63,168H85.29a135.28,135.28,0,0,0,22.3,45.6A88.29,88.29,0,0,1,49.63,168Zm98.78,45.6a135.28,135.28,0,0,0,22.3-45.6h35.66A88.29,88.29,0,0,1,148.41,213.6Z'],
  home: ['M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68ZM208,208H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48V120l80-80,80,80Z'],
  book: ['M232,48H160a40,40,0,0,0-32,16A40,40,0,0,0,96,48H24a8,8,0,0,0-8,8V200a8,8,0,0,0,8,8H96a24,24,0,0,1,24,24,8,8,0,0,0,16,0,24,24,0,0,1,24-24h72a8,8,0,0,0,8-8V56A8,8,0,0,0,232,48ZM96,192H32V64H96a24,24,0,0,1,24,24V200A39.81,39.81,0,0,0,96,192Zm128,0H160a39.81,39.81,0,0,0-24,8V88a24,24,0,0,1,24-24h64Z'],
  table: ['M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48ZM40,112H80v32H40Zm56,0H216v32H96ZM216,64V96H40V64ZM40,160H80v32H40Zm176,32H96V160H216v32Z'],
  sidebar: ['M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM40,56H80V200H40ZM216,200H96V56H216V200Z'],
  users: ['M117.25,157.92a60,60,0,1,0-66.5,0A95.83,95.83,0,0,0,3.53,195.63a8,8,0,1,0,13.4,8.74,80,80,0,0,1,134.14,0,8,8,0,0,0,13.4-8.74A95.83,95.83,0,0,0,117.25,157.92ZM40,108a44,44,0,1,1,44,44A44.05,44.05,0,0,1,40,108Zm210.14,98.7a8,8,0,0,1-11.07-2.33A79.83,79.83,0,0,0,172,168a8,8,0,0,1,0-16,44,44,0,1,0-16.34-84.87,8,8,0,1,1-5.94-14.85,60,60,0,0,1,55.53,105.64,95.83,95.83,0,0,1,47.22,37.71A8,8,0,0,1,250.14,206.7Z'],
  calendar: ['M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Z'],
  clock: ['M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z'],
  headset: ['M201.89,54.66A103.43,103.43,0,0,0,128.79,24H128A104,104,0,0,0,24,128v56a24,24,0,0,0,24,24H64a24,24,0,0,0,24-24V144a24,24,0,0,0-24-24H40.36A88.12,88.12,0,0,1,190.54,65.93,87.39,87.39,0,0,1,215.65,120H192a24,24,0,0,0-24,24v40a24,24,0,0,0,24,24h24a24,24,0,0,1-24,24H136a8,8,0,0,0,0,16h56a40,40,0,0,0,40-40V128A103.41,103.41,0,0,0,201.89,54.66ZM64,136a8,8,0,0,1,8,8v40a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V136Zm128,56a8,8,0,0,1-8-8V144a8,8,0,0,1,8-8h24v56Z'],
  pdf: ['M224,152a8,8,0,0,1-8,8H192v16h16a8,8,0,0,1,0,16H192v16a8,8,0,0,1-16,0V152a8,8,0,0,1,8-8h32A8,8,0,0,1,224,152ZM92,172a28,28,0,0,1-28,28H56v8a8,8,0,0,1-16,0V152a8,8,0,0,1,8-8H64A28,28,0,0,1,92,172Zm-16,0a12,12,0,0,0-12-12H56v24h8A12,12,0,0,0,76,172Zm88,8a36,36,0,0,1-36,36H112a8,8,0,0,1-8-8V152a8,8,0,0,1,8-8h16A36,36,0,0,1,164,180Zm-16,0a20,20,0,0,0-20-20h-8v40h8A20,20,0,0,0,148,180ZM40,112V40A16,16,0,0,1,56,24h96a8,8,0,0,1,5.66,2.34l56,56A8,8,0,0,1,216,88v24a8,8,0,0,1-16,0V96H152a8,8,0,0,1-8-8V40H56v72a8,8,0,0,1-16,0ZM160,80h28.69L160,51.31Z'],
  doc: ['M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-32-80a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,136Zm0,32a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,168Z'],
  quiz: ['M140,180a12,12,0,1,1-12-12A12,12,0,0,1,140,180ZM128,72c-22.06,0-40,16.15-40,36v4a8,8,0,0,0,16,0v-4c0-11,10.77-20,24-20s24,9,24,20-10.77,20-24,20a8,8,0,0,0-8,8v8a8,8,0,0,0,16,0v-.72c18.24-3.35,32-17.9,32-35.28C168,88.15,150.06,72,128,72Zm104,56A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z'],
  playCircle: ['M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm48.24-94.78-64-40A8,8,0,0,0,100,88v80a8,8,0,0,0,12.24,6.78l64-40a8,8,0,0,0,0-13.56ZM116,153.57V102.43L156.91,128Z'],
  check: ['M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z'],
  close: ['M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z'],
  plus: ['M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z'],
  trash: ['M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z'],
  eye: ['M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.47,133.47,0,0,1,25,128,133.33,133.33,0,0,1,48.07,97.25C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.25A133.46,133.46,0,0,1,231.05,128C223.84,141.46,192.43,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z'],
  link: ['M165.66,90.34a8,8,0,0,1,0,11.32l-64,64a8,8,0,0,1-11.32-11.32l64-64A8,8,0,0,1,165.66,90.34ZM215.6,40.4a56,56,0,0,0-79.2,0L106.34,70.45a8,8,0,0,0,11.32,11.32l30.06-30a40,40,0,0,1,56.57,56.56l-30.07,30.06a8,8,0,0,0,11.31,11.32L215.6,119.6a56,56,0,0,0,0-79.2ZM138.34,174.22l-30.06,30.06a40,40,0,1,1-56.56-56.57l30.05-30.05a8,8,0,0,0-11.32-11.32L40.4,136.4a56,56,0,0,0,79.2,79.2l30.06-30.07a8,8,0,0,0-11.32-11.31Z'],
  download: ['M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z'],
  upload: ['M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0ZM93.66,77.66,120,51.31V144a8,8,0,0,0,16,0V51.31l26.34,26.35a8,8,0,0,0,11.32-11.32l-40-40a8,8,0,0,0-11.32,0l-40,40A8,8,0,0,0,93.66,77.66Z'],
  share: ['M176,160a39.89,39.89,0,0,0-28.62,12.09l-46.1-29.63a39.8,39.8,0,0,0,0-28.92l46.1-29.63a40,40,0,1,0-8.66-13.45l-46.1,29.63a40,40,0,1,0,0,55.82l46.1,29.63A40,40,0,1,0,176,160Zm0-128a24,24,0,1,1-24,24A24,24,0,0,1,176,32ZM64,152a24,24,0,1,1,24-24A24,24,0,0,1,64,152Zm112,72a24,24,0,1,1,24-24A24,24,0,0,1,176,224Z'],
  chat: ['M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-6.54-.67L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z'],
  filter: ['M200,136a8,8,0,0,1-8,8H64a8,8,0,0,1,0-16H192A8,8,0,0,1,200,136Zm32-56H24a8,8,0,0,0,0,16H232a8,8,0,0,0,0-16Zm-80,96H104a8,8,0,0,0,0,16h48a8,8,0,0,0,0-16Z'],
  settings: ['M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm109.94-52.79a8,8,0,0,0-3.89-5.4l-29.83-17-.12-33.62a8,8,0,0,0-2.83-6.08,111.91,111.91,0,0,0-36.72-20.67,8,8,0,0,0-6.46.59L128,41.85,97.88,25a8,8,0,0,0-6.47-.6A112.1,112.1,0,0,0,54.73,45.15a8,8,0,0,0-2.83,6.07l-.15,33.65-29.83,17a8,8,0,0,0-3.89,5.4,106.47,106.47,0,0,0,0,41.56,8,8,0,0,0,3.89,5.4l29.83,17,.12,33.62a8,8,0,0,0,2.83,6.08,111.91,111.91,0,0,0,36.72,20.67,8,8,0,0,0,6.46-.59L128,214.15,158.12,231a7.91,7.91,0,0,0,3.9,1,8.09,8.09,0,0,0,2.57-.42,112.1,112.1,0,0,0,36.68-20.73,8,8,0,0,0,2.83-6.07l.15-33.65,29.83-17a8,8,0,0,0,3.89-5.4A106.47,106.47,0,0,0,237.94,107.21Zm-15,34.91-28.57,16.25a8,8,0,0,0-3,3c-.58,1-1.19,2.06-1.81,3.06a7.94,7.94,0,0,0-1.22,4.21l-.15,32.25a95.89,95.89,0,0,1-25.37,14.3L134,199.13a8,8,0,0,0-3.91-1h-.19c-1.21,0-2.43,0-3.64,0a8.08,8.08,0,0,0-4.1,1l-28.84,16.1A96,96,0,0,1,67.88,201l-.11-32.2a8,8,0,0,0-1.22-4.22c-.62-1-1.23-2-1.8-3.06a8.09,8.09,0,0,0-3-3.06l-28.6-16.29a90.49,90.49,0,0,1,0-28.26L61.67,97.63a8,8,0,0,0,3-3c.58-1,1.19-2.06,1.81-3.06a7.94,7.94,0,0,0,1.22-4.21l.15-32.25a95.89,95.89,0,0,1,25.37-14.3L122,56.87a8,8,0,0,0,4.1,1c1.21,0,2.43,0,3.64,0a8.08,8.08,0,0,0,4.1-1l28.84-16.1A96,96,0,0,1,188.12,55l.11,32.2a8,8,0,0,0,1.22,4.22c.62,1,1.23,2,1.8,3.06a8.09,8.09,0,0,0,3,3.06l28.6,16.29A90.49,90.49,0,0,1,222.9,142.12Z'],
  certificate: ['M128,136a8,8,0,0,1-8,8H72a8,8,0,0,1,0-16h48A8,8,0,0,1,128,136Zm-8-40H72a8,8,0,0,0,0,16h48a8,8,0,0,0,0-16Zm112,65.47V224A8,8,0,0,1,220,231l-24-13.74L172,231A8,8,0,0,1,160,224V200H40a16,16,0,0,1-16-16V56A16,16,0,0,1,40,40H216a16,16,0,0,1,16,16V86.53a51.88,51.88,0,0,1,0,74.94ZM160,184V161.47A52,52,0,0,1,216,76V56H40V184Zm56-12a51.88,51.88,0,0,1-40,0v38.22l16-9.16a8,8,0,0,1,7.94,0l16,9.16Zm16-48a36,36,0,1,0-36,36A36,36,0,0,0,232,124Z'],
  shield: ['M208,40H48A16,16,0,0,0,32,56v56c0,52.72,25.52,84.67,46.93,102.19,23.06,18.86,46,25.27,47,25.53a8,8,0,0,0,4.2,0c1-.26,23.91-6.67,47-25.53C198.48,196.67,224,164.72,224,112V56A16,16,0,0,0,208,40Zm0,72c0,37.07-13.66,67.16-40.6,89.42A129.3,129.3,0,0,1,128,223.62a128.25,128.25,0,0,1-38.92-21.81C61.82,179.51,48,149.3,48,112l0-56,160,0Z'],
  lock: ['M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM96,56a32,32,0,0,1,64,0V80H96ZM208,208H48V96H208V208Z'],
  bookmark: ['M184,32H72A16,16,0,0,0,56,48V224a8,8,0,0,0,12.24,6.78L128,193.43l59.77,37.35A8,8,0,0,0,200,224V48A16,16,0,0,0,184,32Zm0,177.57-51.77-32.35a8,8,0,0,0-8.48,0L72,209.57V48H184Z'],
  chevronDown: ['M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z'],
  chevronRight: ['M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z'],
  chevronLeft: ['M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z'],
  chevronsUpDown: ['M181.66,170.34a8,8,0,0,1,0,11.32l-48,48a8,8,0,0,1-11.32,0l-48-48a8,8,0,0,1,11.32-11.32L128,212.69l42.34-42.35A8,8,0,0,1,181.66,170.34Zm-96-84.68L128,43.31l42.34,42.35a8,8,0,0,0,11.32-11.32l-48-48a8,8,0,0,0-11.32,0l-48,48A8,8,0,0,0,85.66,85.66Z'],
  arrowRight: ['M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z'],
  arrowLeft: ['M224,128a8,8,0,0,1-8,8H59.31l58.35,58.34a8,8,0,0,1-11.32,11.32l-72-72a8,8,0,0,1,0-11.32l72-72a8,8,0,0,1,11.32,11.32L59.31,120H216A8,8,0,0,1,224,128Z'],
  more: ['M140,128a12,12,0,1,1-12-12A12,12,0,0,1,140,128Zm56-12a12,12,0,1,0,12,12A12,12,0,0,0,196,116ZM60,116a12,12,0,1,0,12,12A12,12,0,0,0,60,116Z'],
  star: ['M239.18,97.26A16.38,16.38,0,0,0,224.92,86l-59-4.76L143.14,26.15a16.36,16.36,0,0,0-30.27,0L90.11,81.23,31.08,86a16.46,16.46,0,0,0-9.37,28.86l45,38.83L53,211.75a16.38,16.38,0,0,0,24.5,17.82L128,198.49l50.53,31.08A16.4,16.4,0,0,0,203,211.75l-13.76-58.07,45-38.83A16.43,16.43,0,0,0,239.18,97.26Zm-15.34,5.47-48.7,42a8,8,0,0,0-2.56,7.91l14.88,62.8a.37.37,0,0,1-.17.48c-.18.14-.23.11-.38,0l-54.72-33.65a8,8,0,0,0-8.38,0L69.09,215.94c-.15.09-.19.12-.38,0a.37.37,0,0,1-.17-.48l14.88-62.8a8,8,0,0,0-2.56-7.91l-48.7-42c-.12-.1-.23-.19-.13-.5s.18-.27.33-.29l63.92-5.16A8,8,0,0,0,103,91.86l24.62-59.61c.08-.17.11-.25.35-.25s.27.08.35.25L153,91.86a8,8,0,0,0,6.75,4.92l63.92,5.16c.15,0,.24,0,.33.29S224,102.63,223.84,102.73Z'],
  play: ['M232.4,114.49,88.32,26.35a16,16,0,0,0-16.2-.3A15.86,15.86,0,0,0,64,39.87V216.13A15.94,15.94,0,0,0,80,232a16.07,16.07,0,0,0,8.36-2.35L232.4,141.51a15.81,15.81,0,0,0,0-27ZM80,215.94V40l143.83,88Z'],
  signOut: ['M120,216a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V40a8,8,0,0,1,8-8h64a8,8,0,0,1,0,16H56V208h56A8,8,0,0,1,120,216Zm109.66-93.66-40-40a8,8,0,0,0-11.32,11.32L204.69,120H112a8,8,0,0,0,0,16h92.69l-26.35,26.34a8,8,0,0,0,11.32,11.32l40-40A8,8,0,0,0,229.66,122.34Z'],
  signIn: ['M141.66,133.66l-40,40a8,8,0,0,1-11.32-11.32L116.69,136H24a8,8,0,0,1,0-16h92.69L90.34,93.66a8,8,0,0,1,11.32-11.32l40,40A8,8,0,0,1,141.66,133.66ZM200,32H136a8,8,0,0,0,0,16h56V208H136a8,8,0,0,0,0,16h64a8,8,0,0,0,8-8V40A8,8,0,0,0,200,32Z'],
  spinner: ['M232,128a104,104,0,0,1-208,0c0-41,23.81-78.36,60.66-95.27a8,8,0,0,1,6.68,14.54C60.15,61.59,40,93.27,40,128a88,88,0,0,0,176,0c0-34.73-20.15-66.41-51.34-80.73a8,8,0,0,1,6.68-14.54C208.19,49.64,232,87,232,128Z'],
  edit: ['M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z'],
  copy: ['M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z'],
  cards: ['M184,72H40A16,16,0,0,0,24,88V200a16,16,0,0,0,16,16H184a16,16,0,0,0,16-16V88A16,16,0,0,0,184,72Zm0,128H40V88H184V200ZM232,56V176a8,8,0,0,1-16,0V56H64a8,8,0,0,1,0-16H216A16,16,0,0,1,232,56Z'],
  student: ['M226.53,56.41l-96-32a8,8,0,0,0-5.06,0l-96,32A8,8,0,0,0,24,64v80a8,8,0,0,0,16,0V75.1L73.59,86.29a64,64,0,0,0,20.65,88.05c-18,7.06-33.56,19.83-44.94,37.29a8,8,0,1,0,13.4,8.74C77.77,197.25,101.57,184,128,184s50.23,13.25,65.3,36.37a8,8,0,0,0,13.4-8.74c-11.38-17.46-27-30.23-44.94-37.29a64,64,0,0,0,20.65-88l44.12-14.7a8,8,0,0,0,0-15.18ZM176,120A48,48,0,1,1,89.35,91.55l36.12,12a8,8,0,0,0,5.06,0l36.12-12A47.89,47.89,0,0,1,176,120ZM128,87.57,57.3,64,128,40.43,198.7,64Z'],
  info: ['M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-40a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176ZM112,84a12,12,0,1,1,12,12A12,12,0,0,1,112,84Z'],
  warning: ['M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm-8-80V80a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,172Z'],
  chart: ['M232,208a8,8,0,0,1-8,8H32a8,8,0,0,1-8-8V48a8,8,0,0,1,16,0V156.69l50.34-50.35a8,8,0,0,1,11.32,0L128,132.69,180.69,80H160a8,8,0,0,1,0-16h40a8,8,0,0,1,8,8v40a8,8,0,0,1-16,0V91.31l-58.34,58.35a8,8,0,0,1-11.32,0L96,123.31l-56,56V200H224A8,8,0,0,1,232,208Z'],
  medal: ['M216,96A88,88,0,1,0,72,163.83V240a8,8,0,0,0,11.58,7.16L128,225l44.43,22.21A8.07,8.07,0,0,0,176,248a8,8,0,0,0,8-8V163.83A87.85,87.85,0,0,0,216,96ZM56,96a72,72,0,1,1,72,72A72.08,72.08,0,0,1,56,96ZM168,227.06l-36.43-18.21a8,8,0,0,0-7.16,0L88,227.06V174.37a87.89,87.89,0,0,0,80,0ZM128,152A56,56,0,1,0,72,96,56.06,56.06,0,0,0,128,152Zm0-96A40,40,0,1,1,88,96,40,40,0,0,1,128,56Z'],
  group: ['M244.8,150.4a8,8,0,0,1-11.2-1.6A51.6,51.6,0,0,0,192,128a8,8,0,0,1-7.37-4.89,8,8,0,0,1,0-6.22A8,8,0,0,1,192,112a24,24,0,1,0-23.24-30,8,8,0,1,1-15.5-4A40,40,0,1,1,219,117.51a67.94,67.94,0,0,1,27.43,21.68A8,8,0,0,1,244.8,150.4ZM190.92,212a8,8,0,1,1-13.84,8,57,57,0,0,0-98.16,0,8,8,0,1,1-13.84-8,72.06,72.06,0,0,1,33.74-29.92,48,48,0,1,1,58.36,0A72.06,72.06,0,0,1,190.92,212ZM128,176a32,32,0,1,0-32-32A32,32,0,0,0,128,176ZM72,120a8,8,0,0,0-8-8A24,24,0,1,1,87.24,82a8,8,0,1,0,15.5-4A40,40,0,1,0,37,117.51,67.94,67.94,0,0,0,9.6,139.19a8,8,0,1,0,12.8,9.61A51.6,51.6,0,0,1,64,128,8,8,0,0,0,72,120Z'],
  mail: ['M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48Zm-96,85.15L52.57,64H203.43ZM98.71,128,40,181.81V74.19Zm11.84,10.85,12,11.05a8,8,0,0,0,10.82,0l12-11.05,58,53.15H52.57ZM157.29,128,216,74.18V181.82Z'],
  language: ['M128,24h0A104,104,0,1,0,232,128,104.12,104.12,0,0,0,128,24Zm87.62,96H175.79C174,83.49,159.94,57.67,148.41,42.4A88.19,88.19,0,0,1,215.63,120ZM96.23,136h63.54c-2.31,41.61-22.23,67.11-31.77,77C118.45,203.1,98.54,177.6,96.23,136Zm0-16C98.54,78.39,118.46,52.89,128,43c9.55,9.93,29.46,35.43,31.77,77Zm11.36-77.6C96.06,57.67,82,83.49,80.21,120H40.37A88.19,88.19,0,0,1,107.59,42.4ZM40.37,136H80.21c1.82,36.51,15.85,62.33,27.38,77.6A88.19,88.19,0,0,1,40.37,136Zm108,77.6c11.53-15.27,25.56-41.09,27.38-77.6h39.84A88.19,88.19,0,0,1,148.41,213.6Z'],
  mosque: ['M224,128a23.84,23.84,0,0,0-8,1.38V128c0-41.78-31.07-62.46-53.76-77.56C148.16,41.06,136,33,136,24a8,8,0,0,0-16,0c0,9-12.16,17.06-26.24,26.44C71.07,65.54,40,86.22,40,128v1.38A24,24,0,0,0,8,152v56a8,8,0,0,0,8,8H80a8,8,0,0,0,8-8V176a8,8,0,0,1,16,0v32a8,8,0,0,0,8,8h32a8,8,0,0,0,8-8V176a8,8,0,0,1,16,0v32a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V152A24,24,0,0,0,224,128ZM102.63,63.76c9.67-6.44,19-12.68,25.37-20,6.34,7.35,15.7,13.59,25.37,20,20,13.32,42.48,28.29,46.11,56.24h-143C60.15,92.05,82.6,77.08,102.63,63.76ZM24,152a8,8,0,0,1,16,0v48H24Zm136,0a24,24,0,0,0-24,24v24H120V176a24,24,0,0,0-48,0v24H56V136H200v64H184V176A24,24,0,0,0,160,152Zm72,48H216V152a8,8,0,0,1,16,0Z'],
  verified: ['M225.86,102.82c-3.77-3.94-7.67-8-9.14-11.57-1.36-3.27-1.44-8.69-1.52-13.94-.15-9.76-.31-20.82-8-28.51s-18.75-7.85-28.51-8c-5.25-.08-10.67-.16-13.94-1.52-3.56-1.47-7.63-5.37-11.57-9.14C146.28,23.51,138.44,16,128,16s-18.27,7.51-25.18,14.14c-3.94,3.77-8,7.67-11.57,9.14C88,40.64,82.56,40.72,77.31,40.8c-9.76.15-20.82.31-28.51,8S41,67.55,40.8,77.31c-.08,5.25-.16,10.67-1.52,13.94-1.47,3.56-5.37,7.63-9.14,11.57C23.51,109.72,16,117.56,16,128s7.51,18.27,14.14,25.18c3.77,3.94,7.67,8,9.14,11.57,1.36,3.27,1.44,8.69,1.52,13.94.15,9.76.31,20.82,8,28.51s18.75,7.85,28.51,8c5.25.08,10.67.16,13.94,1.52,3.56,1.47,7.63,5.37,11.57,9.14C109.72,232.49,117.56,240,128,240s18.27-7.51,25.18-14.14c3.94-3.77,8-7.67,11.57-9.14,3.27-1.36,8.69-1.44,13.94-1.52,9.76-.15,20.82-.31,28.51-8s7.85-18.75,8-28.51c.08-5.25.16-10.67,1.52-13.94,1.47-3.56,5.37-7.63,9.14-11.57C232.49,146.28,240,138.44,240,128S232.49,109.73,225.86,102.82Zm-11.55,39.29c-4.79,5-9.75,10.17-12.38,16.52-2.52,6.1-2.63,13.07-2.73,19.82-.1,7-.21,14.33-3.32,17.43s-10.39,3.22-17.43,3.32c-6.75.1-13.72.21-19.82,2.73-6.35,2.63-11.52,7.59-16.52,12.38S132,224,128,224s-9.15-4.92-14.11-9.69-10.17-9.75-16.52-12.38c-6.1-2.52-13.07-2.63-19.82-2.73-7-.1-14.33-.21-17.43-3.32s-3.22-10.39-3.32-17.43c-.1-6.75-.21-13.72-2.73-19.82-2.63-6.35-7.59-11.52-12.38-16.52S32,132,32,128s4.92-9.15,9.69-14.11,9.75-10.17,12.38-16.52c2.52-6.1,2.63-13.07,2.73-19.82.1-7,.21-14.33,3.32-17.43S70.51,56.9,77.55,56.8c6.75-.1,13.72-.21,19.82-2.73,6.35-2.63,11.52-7.59,16.52-12.38S124,32,128,32s9.15,4.92,14.11,9.69,10.17,9.75,16.52,12.38c6.1,2.52,13.07,2.63,19.82,2.73,7,.1,14.33.21,17.43,3.32s3.22,10.39,3.32,17.43c.1,6.75.21,13.72,2.73,19.82,2.63,6.35,7.59,11.52,12.38,16.52S224,124,224,128,219.08,137.15,214.31,142.11ZM173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34Z'],
  devices: ['M224,72H208V64a24,24,0,0,0-24-24H40A24,24,0,0,0,16,64v96a24,24,0,0,0,24,24H152v8a24,24,0,0,0,24,24h48a24,24,0,0,0,24-24V96A24,24,0,0,0,224,72ZM40,168a8,8,0,0,1-8-8V64a8,8,0,0,1,8-8H184a8,8,0,0,1,8,8v8H176a24,24,0,0,0-24,24v72Zm192,24a8,8,0,0,1-8,8H176a8,8,0,0,1-8-8V96a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8Zm-96,16a8,8,0,0,1-8,8H88a8,8,0,0,1,0-16h40A8,8,0,0,1,136,208Zm80-96a8,8,0,0,1-8,8H192a8,8,0,0,1,0-16h16A8,8,0,0,1,216,112Z'],
  graduation: ['M251.76,88.94l-120-64a8,8,0,0,0-7.52,0l-120,64a8,8,0,0,0,0,14.12L32,117.87v48.42a15.91,15.91,0,0,0,4.06,10.65C49.16,191.53,78.51,216,128,216a130,130,0,0,0,48-8.76V240a8,8,0,0,0,16,0V199.51a115.63,115.63,0,0,0,27.94-22.57A15.91,15.91,0,0,0,224,166.29V117.87l27.76-14.81a8,8,0,0,0,0-14.12ZM128,200c-43.27,0-68.72-21.14-80-33.71V126.4l76.24,40.66a8,8,0,0,0,7.52,0L176,143.47v46.34C163.4,195.69,147.52,200,128,200Zm80-33.75a97.83,97.83,0,0,1-16,14.25V134.93l16-8.53ZM188,118.94l-.22-.13-56-29.87a8,8,0,0,0-7.52,14.12L171,128l-43,22.93L25,96,128,41.07,231,96Z'],
  leaf: ['M223.45,40.07a8,8,0,0,0-7.52-7.52C139.8,28.08,78.82,51,52.82,94a87.09,87.09,0,0,0-12.76,49c.57,15.92,5.21,32,13.79,47.85l-19.51,19.5a8,8,0,0,0,11.32,11.32l19.5-19.51C81,210.73,97.09,215.37,113,215.94q1.67.06,3.33.06A86.93,86.93,0,0,0,162,203.18C205,177.18,227.93,116.21,223.45,40.07ZM153.75,189.5c-22.75,13.78-49.68,14-76.71.77l88.63-88.62a8,8,0,0,0-11.32-11.32L65.73,179c-13.19-27-13-54,.77-76.71,22.09-36.47,74.6-56.44,141.31-54.06C210.2,114.89,190.22,167.41,153.75,189.5Z'],
  user: ['M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z'],
  eyeOff: ['M53.92,34.62A8,8,0,1,0,42.08,45.38L61.32,66.55C25,88.84,9.38,123.2,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208a127.11,127.11,0,0,0,52.07-10.83l22,24.21a8,8,0,1,0,11.84-10.76Zm47.33,75.84,41.67,45.85a32,32,0,0,1-41.67-45.85ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.16,133.16,0,0,1,25,128c4.69-8.79,19.66-33.39,47.35-49.38l18,19.75a48,48,0,0,0,63.66,70l14.73,16.2A112,112,0,0,1,128,192Zm6-95.43a8,8,0,0,1,3-15.72,48.16,48.16,0,0,1,38.77,42.64,8,8,0,0,1-7.22,8.71,6.39,6.39,0,0,1-.75,0,8,8,0,0,1-8-7.26A32.09,32.09,0,0,0,134,96.57Zm113.28,34.69c-.42.94-10.55,23.37-33.36,43.8a8,8,0,1,1-10.67-11.92A132.77,132.77,0,0,0,231.05,128a133.15,133.15,0,0,0-23.12-30.77C185.67,75.19,158.78,64,128,64a118.37,118.37,0,0,0-19.36,1.57A8,8,0,1,1,106,49.79,134,134,0,0,1,128,48c34.88,0,66.57,13.26,91.66,38.35,18.83,18.83,27.3,37.62,27.65,38.41A8,8,0,0,1,247.31,131.26Z'],
  fileDownload: ['M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-42.34-61.66a8,8,0,0,1,0,11.32l-24,24a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L120,164.69V120a8,8,0,0,1,16,0v44.69l10.34-10.35A8,8,0,0,1,157.66,154.34Z'],
  fileCsv: ['M48,180c0,11,7.18,20,16,20a14.24,14.24,0,0,0,10.22-4.66A8,8,0,0,1,85.78,206.4,30.06,30.06,0,0,1,64,216c-17.65,0-32-16.15-32-36s14.35-36,32-36a30.06,30.06,0,0,1,21.78,9.6,8,8,0,0,1-11.56,11.06A14.24,14.24,0,0,0,64,160C55.18,160,48,169,48,180Zm79.6-8.69c-4-1.16-8.14-2.35-10.45-3.84-1.25-.81-1.23-1-1.12-1.9a4.57,4.57,0,0,1,2-3.67c4.6-3.12,15.34-1.73,19.82-.56A8,8,0,0,0,142,145.86c-2.12-.55-21-5.22-32.84,2.76a20.58,20.58,0,0,0-9,14.95c-2,15.88,13.65,20.41,23,23.11,12.06,3.49,13.12,4.92,12.78,7.59-.31,2.41-1.26,3.34-2.14,3.93-4.6,3.06-15.17,1.56-19.55.36A8,8,0,0,0,109.94,214a61.34,61.34,0,0,0,15.19,2c5.82,0,12.3-1,17.49-4.46a20.82,20.82,0,0,0,9.19-15.23C154,179,137.49,174.17,127.6,171.31Zm83.09-26.84a8,8,0,0,0-10.23,4.84L188,184.21l-12.47-34.9a8,8,0,0,0-15.07,5.38l20,56a8,8,0,0,0,15.07,0l20-56A8,8,0,0,0,210.69,144.47ZM216,88v24a8,8,0,0,1-16,0V96H152a8,8,0,0,1-8-8V40H56v72a8,8,0,0,1-16,0V40A16,16,0,0,1,56,24h96a8,8,0,0,1,5.66,2.34l56,56A8,8,0,0,1,216,88Zm-27.31-8L160,51.31V80Z'],
  fileXls: ['M156,208a8,8,0,0,1-8,8H120a8,8,0,0,1-8-8V152a8,8,0,0,1,16,0v48h20A8,8,0,0,1,156,208ZM92.65,145.49a8,8,0,0,0-11.16,1.86L68,166.24,54.51,147.35a8,8,0,1,0-13,9.3L58.17,180,41.49,203.35a8,8,0,0,0,13,9.3L68,193.76l13.49,18.89a8,8,0,0,0,13-9.3L77.83,180l16.68-23.35A8,8,0,0,0,92.65,145.49Zm98.94,25.82c-4-1.16-8.14-2.35-10.45-3.84-1.25-.82-1.23-1-1.12-1.9a4.54,4.54,0,0,1,2-3.67c4.6-3.12,15.34-1.72,19.82-.56a8,8,0,0,0,4.07-15.48c-2.11-.55-21-5.22-32.83,2.76a20.58,20.58,0,0,0-8.95,14.95c-2,15.88,13.65,20.41,23,23.11,12.06,3.49,13.12,4.92,12.78,7.59-.31,2.41-1.26,3.33-2.15,3.93-4.6,3.06-15.16,1.55-19.54.35A8,8,0,0,0,173.93,214a60.63,60.63,0,0,0,15.19,2c5.82,0,12.3-1,17.49-4.46a20.81,20.81,0,0,0,9.18-15.23C218,179,201.48,174.17,191.59,171.31ZM40,112V40A16,16,0,0,1,56,24h96a8,8,0,0,1,5.66,2.34l56,56A8,8,0,0,1,216,88v24a8,8,0,1,1-16,0V96H152a8,8,0,0,1-8-8V40H56v72a8,8,0,0,1-16,0ZM160,80h28.68L160,51.31Z'],
  shieldCheck: ['M208,40H48A16,16,0,0,0,32,56v56c0,52.72,25.52,84.67,46.93,102.19,23.06,18.86,46,25.26,47,25.53a8,8,0,0,0,4.2,0c1-.27,23.91-6.67,47-25.53C198.48,196.67,224,164.72,224,112V56A16,16,0,0,0,208,40Zm0,72c0,37.07-13.66,67.16-40.6,89.42A129.3,129.3,0,0,1,128,223.62a128.25,128.25,0,0,1-38.92-21.81C61.82,179.51,48,149.3,48,112l0-56,160,0ZM82.34,141.66a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32l-56,56a8,8,0,0,1-11.32,0Z'],
  userCircle: ['M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24ZM74.08,197.5a64,64,0,0,1,107.84,0,87.83,87.83,0,0,1-107.84,0ZM96,120a32,32,0,1,1,32,32A32,32,0,0,1,96,120Zm97.76,66.41a79.66,79.66,0,0,0-36.06-28.75,48,48,0,1,0-59.4,0,79.66,79.66,0,0,0-36.06,28.75,88,88,0,1,1,131.52,0Z'],
  externalLink: ['M224,104a8,8,0,0,1-16,0V59.32l-66.33,66.34a8,8,0,0,1-11.32-11.32L196.68,48H152a8,8,0,0,1,0-16h64a8,8,0,0,1,8,8Zm-40,24a8,8,0,0,0-8,8v72H48V80h72a8,8,0,0,0,0-16H48A16,16,0,0,0,32,80V208a16,16,0,0,0,16,16H176a16,16,0,0,0,16-16V136A8,8,0,0,0,184,128Z'],
  repeat: ['M24,128A72.08,72.08,0,0,1,96,56H204.69L194.34,45.66a8,8,0,0,1,11.32-11.32l24,24a8,8,0,0,1,0,11.32l-24,24a8,8,0,0,1-11.32-11.32L204.69,72H96a56.06,56.06,0,0,0-56,56,8,8,0,0,1-16,0Zm200-8a8,8,0,0,0-8,8,56.06,56.06,0,0,1-56,56H51.31l10.35-10.34a8,8,0,0,0-11.32-11.32l-24,24a8,8,0,0,0,0,11.32l24,24a8,8,0,0,0,11.32-11.32L51.31,200H160a72.08,72.08,0,0,0,72-72A8,8,0,0,0,224,120Z'],
  chevronUp: ['M213.66,165.66a8,8,0,0,1-11.32,0L128,91.31,53.66,165.66a8,8,0,0,1-11.32-11.32l80-80a8,8,0,0,1,11.32,0l80,80A8,8,0,0,1,213.66,165.66Z'],
  archive: ['M224,48H32A16,16,0,0,0,16,64V88a16,16,0,0,0,16,16v88a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V104a16,16,0,0,0,16-16V64A16,16,0,0,0,224,48ZM208,192H48V104H208ZM224,88H32V64H224V88ZM96,136a8,8,0,0,1,8-8h48a8,8,0,0,1,0,16H104A8,8,0,0,1,96,136Z'],
  undo: ['M224,128a96,96,0,0,1-94.71,96H128A95.38,95.38,0,0,1,62.1,197.8a8,8,0,0,1,11-11.63A80,80,0,1,0,71.43,71.39a3.07,3.07,0,0,1-.26.25L44.59,96H72a8,8,0,0,1,0,16H24a8,8,0,0,1-8-8V56a8,8,0,0,1,16,0V85.8L60.25,60A96,96,0,0,1,224,128Z'],
  ban: ['M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm88,104a87.56,87.56,0,0,1-20.41,56.28L71.72,60.4A88,88,0,0,1,216,128ZM40,128A87.56,87.56,0,0,1,60.41,71.72L184.28,195.6A88,88,0,0,1,40,128Z'],
  video: ['M251.77,73a8,8,0,0,0-8.21.39L208,97.05V72a16,16,0,0,0-16-16H32A16,16,0,0,0,16,72V184a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V159l35.56,23.71A8,8,0,0,0,248,184a8,8,0,0,0,8-8V80A8,8,0,0,0,251.77,73ZM192,184H32V72H192V184Zm48-22.95-32-21.33V116.28L240,95Z'],
  calendarPlus: ['M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Zm-48-56a8,8,0,0,1-8,8H136v16a8,8,0,0,1-16,0V160H104a8,8,0,0,1,0-16h16V128a8,8,0,0,1,16,0v16h16A8,8,0,0,1,160,152Z'],
  menu: ['M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128ZM40,72H216a8,8,0,0,0,0-16H40a8,8,0,0,0,0,16ZM216,184H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Z'],
  courses: ['M231.65,194.55,198.46,36.75a16,16,0,0,0-19-12.39L132.65,34.42a16.08,16.08,0,0,0-12.3,19l33.19,157.8A16,16,0,0,0,169.16,224a16.25,16.25,0,0,0,3.38-.36l46.81-10.06A16.09,16.09,0,0,0,231.65,194.55ZM136,50.15c0-.06,0-.09,0-.09l46.8-10,3.33,15.87L139.33,66Zm6.62,31.47,46.82-10.05,3.34,15.9L146,97.53Zm6.64,31.57,46.82-10.06,13.3,63.24-46.82,10.06ZM216,197.94l-46.8,10-3.33-15.87L212.67,182,216,197.85C216,197.91,216,197.94,216,197.94ZM104,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V48A16,16,0,0,0,104,32ZM56,48h48V64H56Zm0,32h48v96H56Zm48,128H56V192h48v16Z'],
  done: ['M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z'],
  chats: ['M232.07,186.76a80,80,0,0,0-62.5-114.17A80,80,0,1,0,23.93,138.76l-7.27,24.71a16,16,0,0,0,19.87,19.87l24.71-7.27a80.39,80.39,0,0,0,25.18,7.35,80,80,0,0,0,108.34,40.65l24.71,7.27a16,16,0,0,0,19.87-19.86ZM62,159.5a8.28,8.28,0,0,0-2.26.32L32,168l8.17-27.76a8,8,0,0,0-.63-6,64,64,0,1,1,26.26,26.26A8,8,0,0,0,62,159.5Zm153.79,28.73L224,216l-27.76-8.17a8,8,0,0,0-6,.63,64.05,64.05,0,0,1-85.87-24.88A79.93,79.93,0,0,0,174.7,89.71a64,64,0,0,1,41.75,92.48A8,8,0,0,0,215.82,188.23Z'],
  icazet: ['M225.86,102.82c-3.77-3.94-7.67-8-9.14-11.57-1.36-3.27-1.44-8.69-1.52-13.94-.15-9.76-.31-20.82-8-28.51s-18.75-7.85-28.51-8c-5.25-.08-10.67-.16-13.94-1.52-3.57-1.47-7.63-5.37-11.57-9.14C146.27,23.51,138.44,16,128,16s-18.27,7.51-25.18,14.14c-3.94,3.77-8,7.67-11.57,9.14C88,40.64,82.56,40.72,77.31,40.8c-9.76.15-20.82.31-28.51,8S41,67.55,40.8,77.31c-.08,5.25-.16,10.67-1.52,13.94-1.47,3.57-5.37,7.63-9.14,11.57C23.51,109.72,16,117.56,16,128s7.51,18.27,14.14,25.18c3.77,3.94,7.67,8,9.14,11.57,1.36,3.27,1.44,8.69,1.52,13.94.15,9.76.31,20.82,8,28.51s18.75,7.85,28.51,8c5.25.08,10.67.16,13.94,1.52,3.56,1.47,7.63,5.37,11.57,9.14C109.73,232.49,117.56,240,128,240s18.27-7.51,25.18-14.14c3.94-3.77,8-7.67,11.57-9.14,3.27-1.36,8.69-1.44,13.94-1.52,9.76-.15,20.82-.31,28.51-8s7.85-18.75,8-28.51c.08-5.25.16-10.67,1.52-13.94,1.47-3.56,5.37-7.63,9.14-11.57C232.49,146.28,240,138.44,240,128S232.49,109.73,225.86,102.82Zm-11.55,39.29c-4.79,5-9.75,10.17-12.38,16.52-2.52,6.1-2.63,13.07-2.73,19.82-.1,7-.21,14.33-3.32,17.43s-10.39,3.22-17.43,3.32c-6.75.1-13.72.21-19.82,2.73-6.35,2.63-11.52,7.59-16.52,12.38S132,224,128,224s-9.14-4.92-14.11-9.69-10.17-9.75-16.52-12.38c-6.1-2.52-13.07-2.63-19.82-2.73-7-.1-14.33-.21-17.43-3.32s-3.22-10.39-3.32-17.43c-.1-6.75-.21-13.72-2.73-19.82-2.63-6.35-7.59-11.52-12.38-16.52S32,132,32,128s4.92-9.14,9.69-14.11,9.75-10.17,12.38-16.52c2.52-6.1,2.63-13.07,2.73-19.82.1-7,.21-14.33,3.32-17.43S70.51,56.9,77.55,56.8c6.75-.1,13.72-.21,19.82-2.73,6.35-2.63,11.52-7.59,16.52-12.38S124,32,128,32s9.14,4.92,14.11,9.69,10.17,9.75,16.52,12.38c6.1,2.52,13.07,2.63,19.82,2.73,7,.1,14.33.21,17.43,3.32s3.22,10.39,3.32,17.43c.1,6.75.21,13.72,2.73,19.82,2.63,6.35,7.59,11.52,12.38,16.52S224,124,224,128,219.08,137.14,214.31,142.11Z'],
  inbox: ['M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm0,16V152h-28.7A15.86,15.86,0,0,0,168,156.69L148.69,176H107.31L88,156.69A15.86,15.86,0,0,0,76.69,152H48V48Zm0,160H48V168H76.69L96,187.31A15.86,15.86,0,0,0,107.31,192h41.38A15.86,15.86,0,0,0,160,187.31L179.31,168H208v40Z'],
  kosk: ['M24,104H48v64H32a8,8,0,0,0,0,16H224a8,8,0,0,0,0-16H208V104h24a8,8,0,0,0,4.19-14.81l-104-64a8,8,0,0,0-8.38,0l-104,64A8,8,0,0,0,24,104Zm40,0H96v64H64Zm80,0v64H112V104Zm48,64H160V104h32ZM128,41.39,203.74,88H52.26ZM248,208a8,8,0,0,1-8,8H16a8,8,0,0,1,0-16H240A8,8,0,0,1,248,208Z'],
  medrese: ['M240,208H224V96a16,16,0,0,0-16-16H144V32a16,16,0,0,0-24.88-13.32L39.12,72A16,16,0,0,0,32,85.34V208H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16ZM208,96V208H144V96ZM48,85.34,128,32V208H48ZM112,112v16a8,8,0,0,1-16,0V112a8,8,0,1,1,16,0Zm-32,0v16a8,8,0,0,1-16,0V112a8,8,0,1,1,16,0Zm0,56v16a8,8,0,0,1-16,0V168a8,8,0,0,1,16,0Zm32,0v16a8,8,0,0,1-16,0V168a8,8,0,0,1,16,0Z'],
  moon: ['M240,96a8,8,0,0,1-8,8H216v16a8,8,0,0,1-16,0V104H184a8,8,0,0,1,0-16h16V72a8,8,0,0,1,16,0V88h16A8,8,0,0,1,240,96ZM144,56h8v8a8,8,0,0,0,16,0V56h8a8,8,0,0,0,0-16h-8V32a8,8,0,0,0-16,0v8h-8a8,8,0,0,0,0,16Zm72.77,97a8,8,0,0,1,1.43,8A96,96,0,1,1,95.07,37.8a8,8,0,0,1,10.6,9.06A88.07,88.07,0,0,0,209.14,150.33,8,8,0,0,1,216.77,153Zm-19.39,14.88c-1.79.09-3.59.14-5.38.14A104.11,104.11,0,0,1,88,64c0-1.79,0-3.59.14-5.38A80,80,0,1,0,197.38,167.86Z'],
  sun: ['M120,40V16a8,8,0,0,1,16,0V40a8,8,0,0,1-16,0Zm72,88a64,64,0,1,1-64-64A64.07,64.07,0,0,1,192,128Zm-16,0a48,48,0,1,0-48,48A48.05,48.05,0,0,0,176,128ZM58.34,69.66A8,8,0,0,0,69.66,58.34l-16-16A8,8,0,0,0,42.34,53.66Zm0,116.68-16,16a8,8,0,0,0,11.32,11.32l16-16a8,8,0,0,0-11.32-11.32ZM192,72a8,8,0,0,0,5.66-2.34l16-16a8,8,0,0,0-11.32-11.32l-16,16A8,8,0,0,0,192,72Zm5.66,114.34a8,8,0,0,0-11.32,11.32l16,16a8,8,0,0,0,11.32-11.32ZM48,128a8,8,0,0,0-8-8H16a8,8,0,0,0,0,16H40A8,8,0,0,0,48,128Zm80,80a8,8,0,0,0-8,8v24a8,8,0,0,0,16,0V216A8,8,0,0,0,128,208Zm112-88H216a8,8,0,0,0,0,16h24a8,8,0,0,0,0-16Z'],
  note: ['M229.66,58.34l-32-32a8,8,0,0,0-11.32,0l-96,96A8,8,0,0,0,88,128v32a8,8,0,0,0,8,8h32a8,8,0,0,0,5.66-2.34l96-96A8,8,0,0,0,229.66,58.34ZM124.69,152H104V131.31l64-64L188.69,88ZM200,76.69,179.31,56,192,43.31,212.69,64ZM224,128v80a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V48A16,16,0,0,1,48,32h80a8,8,0,0,1,0,16H48V208H208V128a8,8,0,0,1,16,0Z'],
  headphones: ['M201.89,54.66A103.43,103.43,0,0,0,128.79,24H128A104,104,0,0,0,24,128v56a24,24,0,0,0,24,24H64a24,24,0,0,0,24-24V144a24,24,0,0,0-24-24H40.36A88,88,0,0,1,128,40h.67a87.71,87.71,0,0,1,87,80H192a24,24,0,0,0-24,24v40a24,24,0,0,0,24,24h16a24,24,0,0,0,24-24V128A103.41,103.41,0,0,0,201.89,54.66ZM64,136a8,8,0,0,1,8,8v40a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V136Zm152,48a8,8,0,0,1-8,8H192a8,8,0,0,1-8-8V144a8,8,0,0,1,8-8h24Z'],
  key: ['M216.57,39.43A80,80,0,0,0,83.91,120.78L28.69,176A15.86,15.86,0,0,0,24,187.31V216a16,16,0,0,0,16,16H72a8,8,0,0,0,8-8V208H96a8,8,0,0,0,8-8V184h16a8,8,0,0,0,5.66-2.34l9.56-9.57A79.73,79.73,0,0,0,160,176h.1A80,80,0,0,0,216.57,39.43ZM224,98.1c-1.09,34.09-29.75,61.86-63.89,61.9H160a63.7,63.7,0,0,1-23.65-4.51,8,8,0,0,0-8.84,1.68L116.69,168H96a8,8,0,0,0-8,8v16H72a8,8,0,0,0-8,8v16H40V187.31l58.83-58.82a8,8,0,0,0,1.68-8.84A63.72,63.72,0,0,1,96,95.92c0-34.14,27.81-62.8,61.9-63.89A64,64,0,0,1,224,98.1ZM192,76a12,12,0,1,1-12-12A12,12,0,0,1,192,76Z'],
  envelope: ['M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48ZM203.43,64,128,133.15,52.57,64ZM216,192H40V74.19l82.59,75.71a8,8,0,0,0,10.82,0L216,74.19V192Z']
};
const fillGlyphs = {
  bookmark: ['M184,32H72A16,16,0,0,0,56,48V224a8,8,0,0,0,12.24,6.78L128,193.43l59.77,37.35A8,8,0,0,0,200,224V48A16,16,0,0,0,184,32Z'],
  star: ['M234.29,114.85l-45,38.83L203,211.75a16.4,16.4,0,0,1-24.5,17.82L128,198.49,77.47,229.57A16.4,16.4,0,0,1,53,211.75l13.76-58.07-45-38.83A16.46,16.46,0,0,1,31.08,86l59-4.76,22.76-55.08a16.36,16.36,0,0,1,30.27,0l22.75,55.08,59,4.76a16.46,16.46,0,0,1,9.37,28.86Z'],
  play: ['M240,128a15.74,15.74,0,0,1-7.6,13.51L88.32,229.65a16,16,0,0,1-16.2.3A15.86,15.86,0,0,1,64,216.13V39.87a15.86,15.86,0,0,1,8.12-13.82,16,16,0,0,1,16.2.3L232.4,114.49A15.74,15.74,0,0,1,240,128Z']
};
const mirrored = new Set(['sidebar', 'chevronRight', 'chevronLeft', 'arrowRight', 'arrowLeft', 'signOut', 'signIn', 'undo']);
const iconNames = Object.keys(glyphs);
// END generated

function Icon({
  name,
  size = 'md',
  filled = false,
  label,
  className = '',
  ...rest
}) {
  const paths = filled && fillGlyphs[name] || glyphs[name];
  if (!paths) return null;
  const cls = ['mds-icon', size !== 'md' && `mds-icon--${size}`, mirrored.has(name) && 'mds-icon--directional', className].filter(Boolean).join(' ');
  const a11y = label ? {
    role: 'img',
    'aria-label': label
  } : {
    'aria-hidden': 'true',
    focusable: 'false'
  };
  return /*#__PURE__*/React.createElement("svg", _extends({
    className: cls,
    viewBox: "0 0 256 256"
  }, a11y, rest), paths.map((d, i) => /*#__PURE__*/React.createElement("path", {
    key: i,
    d: d
  })));
}
Object.assign(__ds_scope, { iconNames, Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Icon.jsx", error: String((e && e.message) || e) }); }

// components/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Keeps a shown bubble inside the viewport and every clipping ancestor (a table frame, a dialog,
// a scrolling body), measured once it shows. Clipped above or below, it moves to the other side
// when it fits there (data-placement); clipped sideways, it shifts by a data variable the class
// layer reads.
function place(anchor) {
  const tip = anchor && anchor.querySelector(':scope > .mds-tooltip');
  if (!tip) return;
  tip.style.removeProperty('--mds-tooltip-shift');
  anchor.removeAttribute('data-placement');
  let r = tip.getBoundingClientRect();
  if (!r.width) return;
  const root = document.documentElement;
  let lo = 8;
  let hi = root.clientWidth - 8;
  let top = 0;
  let bottom = root.clientHeight;
  for (let el = anchor.parentElement; el && el !== document.body; el = el.parentElement) {
    const s = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    if (s.overflowX !== 'visible') {
      lo = Math.max(lo, b.left + el.clientLeft);
      hi = Math.min(hi, b.left + el.clientLeft + el.clientWidth);
    }
    if (s.overflowY !== 'visible') {
      top = Math.max(top, b.top + el.clientTop);
      bottom = Math.min(bottom, b.top + el.clientTop + el.clientHeight);
    }
  }
  const a = anchor.getBoundingClientRect();
  const gap = a.top - r.bottom >= 0 ? a.top - r.bottom : r.top - a.bottom;
  const above = r.bottom <= a.top;
  if (above && r.top < top && a.bottom + gap + r.height <= bottom) anchor.setAttribute('data-placement', 'bottom');
  if (!above && r.bottom > bottom && a.top - gap - r.height >= top) anchor.setAttribute('data-placement', 'top');
  if (anchor.hasAttribute('data-placement')) r = tip.getBoundingClientRect();
  const shift = r.left < lo ? lo - r.left : r.right > hi ? Math.max(hi - r.right, lo - r.left) : 0;
  if (shift) tip.style.setProperty('--mds-tooltip-shift', `${Math.round(shift)}px`);
}

/* An icon-only .mds-btn whose name also shows as a tooltip. It renders the Tooltip markup itself
   (a component file stands alone, MDS-COMP-06). The name is aria-label, so the tooltip, the same
   text, is hidden from assistive technology. */
function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'regular',
  className = '',
  ...rest
}) {
  const anchor = React.useRef(null);
  const [dismissed, setDismissed] = React.useState(false);
  // Esc hides the tooltip while it shows, wherever focus is; leaving or blurring resets it (MDS-A11Y-10).
  React.useEffect(() => {
    // Capture phase, and the key is consumed while the bubble shows: inside a modal Dialog the
    // same Esc would otherwise also close the dialog.
    const onKey = e => {
      const a = anchor.current;
      if (e.key !== 'Escape' || !a || a.hasAttribute('data-dismissed') || !a.matches(':hover, :has(:focus-visible)')) return;
      e.preventDefault();
      setDismissed(true);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
  const reset = () => setDismissed(false);
  const show = () => requestAnimationFrame(() => place(anchor.current));
  const cls = ['mds-btn', 'mds-icon-btn', `mds-btn--${size}`, `mds-btn--${variant}`, className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("span", {
    ref: anchor,
    className: "mds-tooltip-anchor",
    "data-dismissed": dismissed ? '' : undefined,
    onMouseEnter: show,
    onFocus: show,
    onMouseLeave: reset,
    onBlur: reset
  }, /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: cls,
    "aria-label": label
  }, rest), icon), /*#__PURE__*/React.createElement("span", {
    className: "mds-tooltip",
    role: "tooltip",
    "aria-hidden": "true"
  }, label));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Wraps .mds-input. Native attributes, aria-* included, go to the <input>. With
   `leading` or `trailing` the input sits in .mds-input-group; both adornments
   are decorative, so a unit is also written into the label ("Süre (dk)"). */
function Input({
  size = 'regular',
  error = false,
  mono = false,
  leading,
  trailing,
  className = '',
  ...rest
}) {
  const cls = ['mds-input', size !== 'regular' && `mds-input--${size}`, mono && 'mds-input--mono', className].filter(Boolean).join(' ');
  const input = /*#__PURE__*/React.createElement("input", _extends({
    className: cls,
    dir: mono ? 'ltr' : undefined,
    "aria-invalid": error || undefined
  }, rest));
  if (!leading && !trailing) return input;
  return /*#__PURE__*/React.createElement("span", {
    className: "mds-input-group"
  }, leading && /*#__PURE__*/React.createElement("span", {
    className: "mds-input-group__leading",
    "aria-hidden": "true"
  }, leading), input, trailing && /*#__PURE__*/React.createElement("span", {
    className: "mds-input-group__trailing",
    "aria-hidden": "true"
  }, trailing));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Input.jsx", error: String((e && e.message) || e) }); }

// components/LessonRow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Defaults copied from content/status-map.json (lessonType labels) and content/time-zones.json
// (cities); a zone missing here prints its IANA city. Change them there first.
const typeLabels = {
  video: 'Video ders',
  document: 'Doküman',
  live: 'Canlı ders',
  quiz: 'Sınav'
};
const cities = {
  'Europe/Istanbul': 'İstanbul',
  'Europe/Berlin': 'Berlin',
  'Europe/Amsterdam': 'Amsterdam',
  'Europe/Brussels': 'Brüksel',
  'Europe/Paris': 'Paris',
  'Europe/Vienna': 'Viyana',
  'Europe/London': 'Londra',
  'America/New_York': 'New York'
};

// The page's locale (MDS-NUM-01): the locale prop, else the nearest lang once mounted, else tr-TR.
function usePageLocale(ref, locale) {
  const [found, setFound] = React.useState(null);
  React.useEffect(() => {
    const el = ref.current && ref.current.closest('[lang]');
    setFound(el && el.lang || null);
  }, []);
  return locale || found || 'tr-TR';
}

// A meta run: each part but the last ends on its separator, so a wrapped line ends on the dot and
// never starts with it.
function joinRun(parts) {
  return parts.map((p, i) => i < parts.length - 1 ? /*#__PURE__*/React.createElement("span", {
    key: `run${i}`
  }, p, /*#__PURE__*/React.createElement("span", {
    className: "mds-sep",
    "aria-hidden": "true"
  }, "\xB7")) : p);
}
function format(locale, at, timeZone, options) {
  try {
    return new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone
    }).format(at);
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(at);
  }
}

// "3 Eki Cmt 21:00", and when the course's zone differs from the viewer's
// "3 Eki Cmt 21:00 İstanbul" + "20:00 senin saatinle" (MDS-NUM-01).
function sessionTimes(startsAt, {
  timeZone,
  courseTimeZone,
  courseZoneName,
  localTimeLabel,
  locale
}) {
  const at = new Date(startsAt);
  if (Number.isNaN(at.getTime())) return [];
  const day = {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  };
  const clock = {
    hour: '2-digit',
    minute: '2-digit'
  };
  const course = courseTimeZone || timeZone;
  const first = format(locale, at, course, {
    ...day,
    ...clock
  });
  if (!courseTimeZone || format(locale, at, timeZone, {
    ...day,
    ...clock
  }) === first) {
    return [/*#__PURE__*/React.createElement("time", {
      key: "at",
      dateTime: startsAt
    }, first)];
  }
  const sameDay = format(locale, at, timeZone, day) === format(locale, at, course, day);
  const local = format(locale, at, timeZone, sameDay ? clock : {
    weekday: 'short',
    ...clock
  });
  const city = courseZoneName || cities[course] || course.split('/').pop().replace(/_/g, ' ');
  return [/*#__PURE__*/React.createElement("time", {
    key: "at",
    dateTime: startsAt
  }, first, " ", city), /*#__PURE__*/React.createElement("span", {
    key: "local"
  }, local, " ", localTimeLabel)];
}
function LessonRow({
  title,
  type,
  state = 'default',
  access = 'open',
  href,
  typeLabel,
  source,
  durationMinutes,
  startsAt,
  timeZone,
  courseTimeZone,
  courseZoneName,
  currentLabel = 'Sıradaki',
  doneLabel = ', tamamlandı',
  lockedLabel = 'Kilitli',
  localTimeLabel = 'senin saatinle',
  minuteUnit = 'dk',
  locale: localeProp,
  trailing,
  className = '',
  ...rest
}) {
  const ref = React.useRef(null);
  const locale = usePageLocale(ref, localeProp);
  const locked = access === 'locked';
  const cls = ['mds-lesson-row', `mds-lesson-row--${type}`, state === 'done' && 'is-done', locked && 'is-locked', className].filter(Boolean).join(' ');
  const titleProps = {
    className: 'mds-lesson-row__title',
    dir: 'auto',
    'aria-current': state === 'current' ? 'step' : undefined
  };
  const name = /*#__PURE__*/React.createElement(React.Fragment, null, title, state === 'done' && /*#__PURE__*/React.createElement("span", {
    className: "mds-visually-hidden"
  }, doneLabel));
  const meta = [];
  if (state === 'current') meta.push(/*#__PURE__*/React.createElement("span", {
    key: "marker",
    className: "mds-lesson-row__marker"
  }, currentLabel));
  meta.push(/*#__PURE__*/React.createElement("span", {
    key: "type"
  }, typeLabel ?? typeLabels[type]));
  if (source) meta.push(/*#__PURE__*/React.createElement("bdi", {
    key: "source",
    className: "mds-lesson-row__source"
  }, source));
  if (startsAt) meta.push(...sessionTimes(startsAt, {
    timeZone,
    courseTimeZone,
    courseZoneName,
    localTimeLabel,
    locale
  }));
  return /*#__PURE__*/React.createElement("li", _extends({
    ref: ref,
    className: cls
  }, rest), /*#__PURE__*/React.createElement("span", {
    className: "mds-lesson-row__medallion",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("div", {
    className: "mds-lesson-row__main"
  }, href && !locked ? /*#__PURE__*/React.createElement("a", _extends({
    href: href
  }, titleProps), name) : /*#__PURE__*/React.createElement("span", titleProps, name), /*#__PURE__*/React.createElement("p", {
    className: "mds-lesson-row__meta"
  }, joinRun(meta))), trailing && /*#__PURE__*/React.createElement("span", {
    className: "mds-lesson-row__trailing"
  }, trailing), locked && /*#__PURE__*/React.createElement("span", {
    className: "mds-lesson-row__lock",
    role: "img",
    "aria-label": lockedLabel
  }), durationMinutes != null && /*#__PURE__*/React.createElement("time", {
    className: "mds-lesson-row__duration",
    dateTime: `PT${durationMinutes}M`
  }, new Intl.NumberFormat(locale).format(durationMinutes), ' ', minuteUnit));
}
Object.assign(__ds_scope, { LessonRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/LessonRow.jsx", error: String((e && e.message) || e) }); }

// components/Logo.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// assets/logo-arabic.svg: مدارس as outlined paths, so a Latin-only page never loads the Naskh file for the logo.
const ARABIC_VIEWBOX = '68 -677 2527 932';
const ARABIC_PATH = 'M250 255Q163 255 116 204Q68 153 68 56Q68 38 70 18Q72 -2 78 -27Q83 -52 91 -84L133 -74Q120 -27 120 3Q120 75 154 112Q187 149 253 149Q305 149 350 138Q394 126 432 104Q469 81 497 48Q464 -20 442 -68Q419 -116 419 -138Q419 -174 440 -202Q461 -231 508 -255Q510 -242 513 -223Q516 -204 521 -176Q526 -149 532 -111Q549 -108 564 -106Q579 -105 592 -105Q615 -105 630 -107Q646 -109 669 -115Q677 -129 691 -166Q700 -193 708 -214Q716 -234 722 -250Q728 -266 738 -272Q749 -279 766 -279Q785 -279 799 -270Q792 -255 781 -222Q770 -188 756 -143Q798 -123 842 -114Q885 -104 940 -100Q931 -121 920 -144Q910 -168 898 -194Q886 -218 878 -238Q870 -257 870 -273Q870 -296 894 -323Q918 -350 953 -369Q959 -338 966 -304Q973 -270 979 -240Q986 -205 990 -179Q994 -153 994 -136Q994 -122 988 -97Q982 -72 972 -46Q963 -19 953 0Q891 0 833 -12Q775 -25 723 -48L713 -28Q706 -16 669 -8Q650 -4 628 -2Q606 0 580 0Q572 0 564 -0Q555 -1 546 -2V10Q546 75 506 132Q467 189 398 222Q364 239 327 247Q290 255 250 255Z M1150 198Q1137 198 1115 188Q1093 179 1066 162Q1040 145 1016 125L1031 86Q1058 93 1083 96Q1108 99 1130 99Q1204 99 1256 60Q1308 20 1332 -55Q1325 -70 1317 -86Q1309 -101 1299 -117Q1269 -167 1248 -206Q1227 -246 1227 -276Q1227 -304 1248 -328Q1268 -352 1302 -369Q1307 -350 1316 -324Q1324 -297 1334 -271Q1343 -245 1350 -224Q1363 -188 1372 -152Q1380 -117 1380 -86Q1380 -8 1350 58Q1320 123 1268 161Q1215 198 1150 198Z M1540 -6Q1537 -104 1532 -182Q1528 -261 1524 -329Q1519 -397 1514 -460Q1509 -523 1502 -591Q1499 -616 1510 -635Q1522 -654 1544 -664Q1567 -675 1595 -677Q1602 -650 1612 -618Q1622 -587 1634 -555L1602 -530Q1605 -469 1606 -392Q1606 -315 1604 -221Q1603 -127 1598 -14Z M1858 0Q1728 0 1728 -73Q1728 -93 1735 -113Q1742 -133 1754 -145Q1779 -125 1811 -115Q1843 -105 1890 -105Q1920 -105 1952 -109Q1983 -113 2016 -121Q1990 -166 1970 -210Q1951 -254 1940 -290Q1929 -326 1929 -345Q1929 -377 1945 -400Q1961 -423 1993 -433Q2014 -350 2036 -285Q2057 -220 2084 -173Q2103 -138 2126 -124Q2148 -110 2184 -110Q2192 -110 2192 -102V-14Q2192 -6 2184 -6Q2147 -6 2118 -18Q2088 -30 2065 -54Q1961 0 1858 0Z M2539 0Q2496 0 2451 -7Q2406 -14 2365 -28Q2324 -41 2293 -57Q2269 -30 2242 -18Q2214 -6 2175 -6Q2167 -6 2167 -14V-102Q2167 -110 2175 -110Q2215 -110 2244 -128Q2273 -147 2292 -184Q2306 -211 2316 -231Q2327 -251 2336 -266Q2345 -282 2354 -295Q2379 -328 2402 -342Q2426 -357 2455 -357Q2489 -357 2522 -320Q2554 -283 2575 -223Q2595 -165 2595 -110Q2595 -82 2580 -51Q2564 -20 2539 0ZM2510 -99Q2507 -139 2494 -174Q2482 -210 2467 -231Q2452 -249 2440 -249Q2413 -249 2391 -222Q2383 -212 2371 -192Q2359 -172 2344 -142Q2377 -126 2418 -115Q2459 -104 2510 -99Z';

// The subtitle an app gets when the caller passes none. The landing page has none.
const appNames = {
  tedris: 'Tedris',
  nizam: 'Nizam',
  nazir: 'Nazır',
  giris: 'Giriş'
};

// The arch's filter id must be unique per instance. React.useId where it exists; a module counter only for
// a React without it.
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `l${++seq}`)[0]);

/* Wraps .mds-logo: the Medaris mark (libs/icons MadrasahLogoIcon, the same as assets/logo-mark.svg), a
   lâciverd ground and a pale lâciverd arch, the same in both themes. At lg the wordmark lockup adds مدارس,
   and the app's name is not drawn unless the caller passes a subtitle. */
function Logo({
  app,
  size = 'md',
  wordmark = false,
  subtitle = size === 'lg' ? undefined : appNames[app],
  className = '',
  ...rest
}) {
  const filter = `mds-logo-arch-${useUid().replace(/[^\w-]/g, '')}`;
  const cls = ['mds-logo', size !== 'md' && `mds-logo--${size}`, className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls,
    role: "img",
    "aria-label": subtitle ? `Medaris — ${subtitle}` : 'Medaris'
  }, rest), /*#__PURE__*/React.createElement("svg", {
    className: "mds-logo__mark",
    viewBox: "0 0 48 48",
    "aria-hidden": "true",
    focusable: "false"
  }, /*#__PURE__*/React.createElement("rect", {
    className: "mds-logo__ground",
    width: "48",
    height: "48",
    rx: "12"
  }), /*#__PURE__*/React.createElement("g", {
    className: "mds-logo__arch",
    filter: `url(#${filter})`
  }, /*#__PURE__*/React.createElement("path", {
    d: "M14.4327 24.2434V38.1C14.4327 38.9284 15.1042 39.6 15.9327 39.6H23.7173V8.4C15.0737 9.68201 14.9368 16.815 16.0327 20.4C14.0326 21.2 14.4327 23.2 14.4327 24.2434Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M33.3172 24.2434V38.1C33.3172 38.9284 32.6456 39.6 31.8172 39.6H24.0325V8.4C32.6762 9.68201 32.8131 16.815 31.7172 20.4C33.7172 21.2 33.3172 23.2 33.3172 24.2434Z"
  })), /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("filter", {
    id: filter,
    x: "14.4",
    y: "8.4",
    width: "18.9498",
    height: "31.2",
    filterUnits: "userSpaceOnUse",
    colorInterpolationFilters: "sRGB"
  }, /*#__PURE__*/React.createElement("feFlood", {
    floodOpacity: "0",
    result: "BackgroundImageFix"
  }), /*#__PURE__*/React.createElement("feBlend", {
    mode: "normal",
    in: "SourceGraphic",
    in2: "BackgroundImageFix",
    result: "shape"
  }), /*#__PURE__*/React.createElement("feColorMatrix", {
    in: "SourceAlpha",
    type: "matrix",
    values: "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0",
    result: "hardAlpha"
  }), /*#__PURE__*/React.createElement("feOffset", null), /*#__PURE__*/React.createElement("feGaussianBlur", {
    stdDeviation: "0.375"
  }), /*#__PURE__*/React.createElement("feComposite", {
    in2: "hardAlpha",
    operator: "arithmetic",
    k2: "-1",
    k3: "1"
  }), /*#__PURE__*/React.createElement("feColorMatrix", {
    type: "matrix",
    values: "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.3 0"
  }), /*#__PURE__*/React.createElement("feBlend", {
    mode: "normal",
    in2: "shape",
    result: "innerShadow"
  })))), wordmark && /*#__PURE__*/React.createElement("span", {
    className: "mds-logo__text"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mds-logo__word",
    lang: "en",
    dir: "ltr"
  }, "Medaris"), size === 'lg' && /*#__PURE__*/React.createElement("svg", {
    className: "mds-logo__arabic",
    viewBox: ARABIC_VIEWBOX,
    "aria-hidden": "true",
    focusable: "false"
  }, /*#__PURE__*/React.createElement("path", {
    d: ARABIC_PATH
  })), subtitle && /*#__PURE__*/React.createElement("span", {
    className: "mds-logo__subtitle",
    dir: "auto"
  }, subtitle)));
}
Object.assign(__ds_scope, { Logo });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Logo.jsx", error: String((e && e.message) || e) }); }

// components/NavItem.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// The page's locale (MDS-NUM-01): the locale prop, else the nearest lang once mounted, else tr-TR.
function usePageLocale(ref, locale) {
  const [found, setFound] = React.useState(null);
  React.useEffect(() => {
    const el = ref.current && ref.current.closest('[lang]');
    setFound(el && el.lang || null);
  }, [ref]);
  return locale || found || 'tr-TR';
}
function formatCount(n, locale) {
  try {
    return new Intl.NumberFormat(locale).format(n);
  } catch {
    return new Intl.NumberFormat('tr-TR').format(n);
  }
}

/* Wraps .mds-nav-item. A link, never a button: routing is by URL, and aria-current
   marks the viewer's page. The same item in the sidebar and in AppBar's nav sheet. */
function NavItem({
  href,
  icon,
  active = false,
  count,
  countLabel,
  trailing,
  locale,
  children,
  className = '',
  ...rest
}) {
  const ref = React.useRef(null);
  const lang = usePageLocale(ref, locale);
  const cls = ['mds-nav-item', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("a", _extends({
    ref: ref,
    className: cls,
    href: href,
    "aria-current": active ? 'page' : undefined
  }, rest), icon, children, count > 0 && /*#__PURE__*/React.createElement("span", {
    className: "mds-nav-item__count"
  }, formatCount(count, lang), countLabel && /*#__PURE__*/React.createElement("span", {
    className: "mds-visually-hidden"
  }, " ", countLabel)), trailing && /*#__PURE__*/React.createElement("span", {
    className: "mds-nav-item__trailing"
  }, trailing));
}
Object.assign(__ds_scope, { NavItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/NavItem.jsx", error: String((e && e.message) || e) }); }

// components/NavSection.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Wraps .mds-nav-section: the label above a group of NavItems. Written in sentence
   case; CSS uppercases it, which needs lang="tr" on an ancestor for İ. */
function NavSection({
  children,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['mds-nav-section', className].filter(Boolean).join(' ')
  }, rest), children);
}
Object.assign(__ds_scope, { NavSection });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/NavSection.jsx", error: String((e && e.message) || e) }); }

// components/PlatformChip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Labels copied from content/meeting-platforms.json and content/recording-providers.json.
const labels = {
  'google-meet': 'Google Meet',
  zoom: 'Zoom',
  jitsi: 'Jitsi Meet',
  youtube: 'YouTube',
  'google-drive': 'Google Drive'
};
function PlatformChip({
  platform,
  kind = 'meeting',
  label,
  host,
  detected = false,
  unknownLabel = 'Bilinmeyen platform',
  detectedLabel = ', bağlantıdan algılandı',
  className = '',
  ...rest
}) {
  const meeting = kind === 'meeting';
  const unknown = !labels[platform];
  // an unknown recording host shows the host alone: a talebe reads "unknown" as a warning
  const text = label ?? (unknown ? meeting ? unknownLabel : null : labels[platform]);
  const showHost = unknown && host;
  if (!text && !showHost) return null;
  const cls = ['mds-platform-chip', `mds-platform-chip--${platform}`, className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls,
    role: detected ? 'status' : undefined
  }, rest), meeting && /*#__PURE__*/React.createElement("span", {
    className: "mds-platform-chip__dot",
    "aria-hidden": "true"
  }), text, showHost && /*#__PURE__*/React.createElement("span", {
    className: "mds-platform-chip__host",
    dir: "ltr"
  }, host), detected && /*#__PURE__*/React.createElement("span", {
    className: "mds-visually-hidden"
  }, detectedLabel));
}
Object.assign(__ds_scope, { PlatformChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/PlatformChip.jsx", error: String((e && e.message) || e) }); }

// components/Progress.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// The label id must be unique per instance. React.useId where it exists; a
// module counter only for a React without it.
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `p${++seq}`)[0]);

// The page's locale (MDS-NUM-01): the locale prop, else the nearest lang once mounted, else tr-TR.
function usePageLocale(ref, locale) {
  const [found, setFound] = React.useState(null);
  React.useEffect(() => {
    const el = ref.current && ref.current.closest('[lang]');
    setFound(el && el.lang || null);
  }, []);
  return locale || found || 'tr-TR';
}
function formatPercent(n, locale) {
  const options = {
    style: 'percent',
    maximumFractionDigits: 0
  };
  try {
    return new Intl.NumberFormat(locale, options).format(n);
  } catch (e) {
    return new Intl.NumberFormat('tr-TR', options).format(n);
  }
}

/* A determinate .mds-progress bar with its visible name. The value is a data variable the class
   layer reads (--mds-progress); the percent is Intl in the page's locale: %72 in Turkish. */
function Progress({
  value = 0,
  label,
  showValue = false,
  completeLabel = 'tamamlandı',
  locale,
  className = '',
  ...rest
}) {
  const ref = React.useRef(null);
  const id = `mds-progress-${useUid()}`;
  const lang = usePageLocale(ref, locale);
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const done = pct === 100;
  const text = done ? `${formatPercent(1, lang)} ${completeLabel}` : formatPercent(pct / 100, lang);
  return /*#__PURE__*/React.createElement("div", _extends({
    ref: ref,
    className: className || undefined
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "mds-progress__label"
  }, /*#__PURE__*/React.createElement("span", {
    id: id
  }, label), showValue && /*#__PURE__*/React.createElement("span", {
    className: "mds-progress__value",
    "aria-hidden": "true"
  }, done && /*#__PURE__*/React.createElement("span", {
    className: "mds-progress__check"
  }), text)), /*#__PURE__*/React.createElement("div", {
    className: "mds-progress",
    role: "progressbar",
    "aria-labelledby": id,
    "aria-valuenow": pct,
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuetext": text
  }, /*#__PURE__*/React.createElement("div", {
    className: "mds-progress__bar",
    style: {
      '--mds-progress': `${pct}%`
    }
  })));
}
Object.assign(__ds_scope, { Progress });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Progress.jsx", error: String((e && e.message) || e) }); }

// components/Radio.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `r${++seq}`)[0]);

/* One native radio inside its own <label class="mds-choice">. A set of radios is a
   RadioGroup, which draws this markup itself. Native attributes go to the <input>;
   className goes to the label. */
function Radio({
  label,
  description,
  icon,
  bordered = false,
  className = '',
  ...rest
}) {
  const uid = useUid().replace(/[^\w-]/g, '');
  const labelId = `mds-choice-${uid}-l`;
  const descId = `mds-choice-${uid}-d`;
  const labelledBy = [rest['aria-labelledby'], labelId].filter(Boolean).join(' ');
  const describedBy = [rest['aria-describedby'], description && descId].filter(Boolean).join(' ') || undefined;
  const cls = ['mds-choice', bordered && 'mds-choice--bordered', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("label", {
    className: cls
  }, /*#__PURE__*/React.createElement("input", _extends({}, rest, {
    type: "radio",
    className: "mds-radio",
    "aria-labelledby": labelledBy,
    "aria-describedby": describedBy
  })), icon && /*#__PURE__*/React.createElement("span", {
    className: "mds-choice__icon",
    "aria-hidden": "true"
  }, icon), /*#__PURE__*/React.createElement("span", {
    className: "mds-choice__text"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mds-choice__label",
    id: labelId
  }, label), description && /*#__PURE__*/React.createElement("span", {
    className: "mds-choice__desc",
    id: descId
  }, description)));
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Radio.jsx", error: String((e && e.message) || e) }); }

// components/RadioGroup.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `g${++seq}`)[0]);

/* A <fieldset> of native radios under a visible <legend>. It draws the Radio
   markup itself (.mds-choice), since a component file never uses another one.
   Controlled with `value`, uncontrolled with `defaultValue`. */
function RadioGroup({
  legend,
  name,
  options = [],
  value,
  defaultValue,
  onChange,
  bordered = false,
  className = ''
}) {
  const uid = useUid().replace(/[^\w-]/g, '');
  const change = e => onChange && onChange(e.target.value, e);
  const choice = ['mds-choice', bordered && 'mds-choice--bordered'].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("fieldset", {
    className: ['mds-choice-group', className].filter(Boolean).join(' ')
  }, /*#__PURE__*/React.createElement("legend", {
    className: "mds-label"
  }, legend), options.map((o, i) => {
    const labelId = `mds-choice-${uid}-${i}-l`;
    const descId = o.description ? `mds-choice-${uid}-${i}-d` : undefined;
    const state = value !== undefined ? {
      checked: value === o.value
    } : {
      defaultChecked: defaultValue === o.value
    };
    return /*#__PURE__*/React.createElement("label", {
      key: o.value,
      className: choice
    }, /*#__PURE__*/React.createElement("input", _extends({
      type: "radio",
      className: "mds-radio",
      name: name,
      value: o.value,
      disabled: o.disabled,
      "aria-labelledby": labelId,
      "aria-describedby": descId,
      onChange: change
    }, state)), o.icon && /*#__PURE__*/React.createElement("span", {
      className: "mds-choice__icon",
      "aria-hidden": "true"
    }, o.icon), /*#__PURE__*/React.createElement("span", {
      className: "mds-choice__text"
    }, /*#__PURE__*/React.createElement("span", {
      className: "mds-choice__label",
      id: labelId
    }, o.label), o.description && /*#__PURE__*/React.createElement("span", {
      className: "mds-choice__desc",
      id: descId
    }, o.description)));
  }));
}
Object.assign(__ds_scope, { RadioGroup });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/RadioGroup.jsx", error: String((e && e.message) || e) }); }

// components/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* A native <select> in the .mds-input box; .mds-select draws the chevron. Native
   attributes, aria-* included, go to the <select>; className goes to the wrapper.
   Until something is chosen it shows `placeholder` as a hidden, disabled first
   option, so an unanswered select never looks answered. */
function Select({
  options = [],
  placeholder = 'Seçin',
  size = 'regular',
  error = false,
  value,
  defaultValue,
  className = '',
  ...rest
}) {
  const cls = ['mds-input', size !== 'regular' && `mds-input--${size}`].filter(Boolean).join(' ');
  const start = placeholder && value === undefined && defaultValue === undefined ? '' : defaultValue;
  return /*#__PURE__*/React.createElement("span", {
    className: ['mds-select', className].filter(Boolean).join(' ')
  }, /*#__PURE__*/React.createElement("select", _extends({
    className: cls,
    value: value,
    defaultValue: start,
    "aria-invalid": error || undefined
  }, rest), placeholder && /*#__PURE__*/React.createElement("option", {
    value: "",
    disabled: true,
    hidden: true
  }, placeholder), options.map(o => {
    const opt = typeof o === 'string' ? {
      value: o,
      label: o
    } : o;
    return /*#__PURE__*/React.createElement("option", {
      key: opt.value,
      value: opt.value,
      disabled: opt.disabled
    }, opt.label);
  })));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Select.jsx", error: String((e && e.message) || e) }); }

// components/SessionJoin.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// The ids must be unique per instance. React.useId where it exists; a module
// counter only for a React without it.
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `j${++seq}`)[0]);

// Defaults copied from content/meeting-platforms.json (labels) and content/time-zones.json
// (cities); a zone missing here prints its IANA city. Change them there first.
const platformLabels = {
  'google-meet': 'Google Meet',
  zoom: 'Zoom',
  jitsi: 'Jitsi Meet',
  unknown: 'Bilinmeyen platform'
};
const cities = {
  'Europe/Istanbul': 'İstanbul',
  'Europe/Berlin': 'Berlin',
  'Europe/Amsterdam': 'Amsterdam',
  'Europe/Brussels': 'Brüksel',
  'Europe/Paris': 'Paris',
  'Europe/Vienna': 'Viyana',
  'Europe/London': 'Londra',
  'America/New_York': 'New York'
};
const MINUTE = 60000;
const HOUR = 60 * MINUTE;

// The page's locale (MDS-NUM-01): the locale prop, else the nearest lang once mounted, else tr-TR.
function usePageLocale(ref, locale) {
  const [found, setFound] = React.useState(null);
  React.useEffect(() => {
    const el = ref.current && ref.current.closest('[lang]');
    setFound(el && el.lang || null);
  }, []);
  return locale || found || 'tr-TR';
}

// A meta run: each part but the last ends on its separator, so a wrapped line ends on the dot and
// never starts with it.
function joinRun(parts) {
  return parts.map((p, i) => i < parts.length - 1 ? /*#__PURE__*/React.createElement("span", {
    key: `run${i}`
  }, p, /*#__PURE__*/React.createElement("span", {
    className: "mds-sep",
    "aria-hidden": "true"
  }, "\xB7")) : p);
}
function format(locale, at, timeZone, options) {
  try {
    return new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone
    }).format(at);
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(at);
  }
}

// The calendar day of an instant in a zone, as a day count, so "dün" and "yarın" follow the
// viewer's calendar rather than 24-hour spans.
function dayNumber(at, timeZone) {
  const [y, m, d] = format('en-CA', at, timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / (24 * HOUR);
}

// "14 dakika sonra", "2 saat sonra", "Yarın", "3 gün sonra": a badge label, so its first letter is
// upper-cased in the page's locale (MDS-VOICE-02); Intl writes "yarın" and "şimdi".
function countdown(locale, at, now, timeZone) {
  const rtf = new Intl.RelativeTimeFormat(locale, {
    numeric: 'auto'
  });
  const ms = at - now;
  let s;
  if (Math.abs(ms) < HOUR) s = rtf.format(Math.round(ms / MINUTE), 'minute');else if (Math.abs(ms) < 24 * HOUR) s = rtf.format(Math.round(ms / HOUR), 'hour');else s = rtf.format(dayNumber(at, timeZone) - dayNumber(now, timeZone), 'day');
  return s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);
}
function SessionJoin({
  startsAt,
  durationMinutes,
  timeZone,
  courseTimeZone,
  courseZoneName,
  state = 'upcoming',
  title,
  headingLevel = 2,
  platform,
  platformLabel,
  host,
  href,
  linkUpdatedAt,
  recordingsHref,
  actions,
  access = 'enrolled',
  lockedReason = 'Bu celsenin bağlantısı kayıtlı talebelere açıktır.',
  action,
  now,
  joinWindowMinutes = 10,
  label = 'Canlı ders',
  liveLabel = 'Şu an canlı',
  endedLabel = 'Sona erdi',
  cancelledLabel = 'İptal edildi',
  cancelledText = 'Bu celse iptal edildi.',
  noLinkText = 'Bağlantı henüz eklenmedi.',
  joinOpensText = 'Katılım, celse başlamadan {minutes} dakika önce açılır.',
  joinLabel = 'Celseye katıl',
  newTabLabel = ' (yeni sekmede açılır)',
  revealLabel = 'Bağlantıyı göster',
  linkUpdatedText = 'Bağlantı {when} güncellendi.',
  recordingsLabel = 'Ders kayıtlarına git',
  localTimeLabel = 'senin saatinle',
  minuteUnit = 'dk',
  locale: localeProp,
  className = '',
  ...rest
}) {
  const ref = React.useRef(null);
  const locale = usePageLocale(ref, localeProp);
  const eyebrowId = `mds-join-${useUid().replace(/[^\w-]/g, '')}`;
  const headingId = `${eyebrowId}-h`;
  const atId = `${eyebrowId}-at`;
  const Heading = `h${[2, 3, 4].includes(headingLevel) ? headingLevel : 2}`;
  // Without a fixed `now`, re-render every 30 s: the countdown and the join window move.
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    if (now) return undefined;
    const timer = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(timer);
  }, [now]);
  const at = new Date(startsAt);
  const valid = !Number.isNaN(at.getTime());
  // Named by the title, or else the eyebrow, and the start: two cards on one page are two distinct regions.
  const labelledBy = [title ? headingId : eyebrowId, valid && atId].filter(Boolean).join(' ');
  const nowAt = now ? new Date(now) : new Date();
  const locked = access === 'locked';

  // ------------------------------------------------ time, in both zones when they differ
  const day = {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  };
  const clock = {
    hour: '2-digit',
    minute: '2-digit'
  };
  const course = courseTimeZone || timeZone;
  const times = [];
  if (valid) {
    const first = format(locale, at, course, {
      ...day,
      ...clock
    });
    if (!courseTimeZone || format(locale, at, timeZone, {
      ...day,
      ...clock
    }) === first) {
      times.push(/*#__PURE__*/React.createElement("time", {
        key: "at",
        id: atId,
        dateTime: startsAt
      }, first));
    } else {
      const sameDay = format(locale, at, timeZone, day) === format(locale, at, course, day);
      const city = courseZoneName || cities[course] || course.split('/').pop().replace(/_/g, ' ');
      times.push(/*#__PURE__*/React.createElement("time", {
        key: "at",
        id: atId,
        dateTime: startsAt
      }, first, " ", city));
      times.push(/*#__PURE__*/React.createElement("span", {
        key: "local",
        className: "mds-join__zone"
      }, format(locale, at, timeZone, sameDay ? clock : {
        weekday: 'short',
        ...clock
      }), " ", localTimeLabel));
    }
  }
  if (durationMinutes != null) {
    times.push(/*#__PURE__*/React.createElement("time", {
      key: "dur",
      className: "mds-join__zone",
      dateTime: `PT${durationMinutes}M`
    }, new Intl.NumberFormat(locale).format(durationMinutes), ' ', minuteUnit));
  }

  // ------------------------------------------------ the state badge (content/status-map.json session)
  let badge;
  if (state === 'live') badge = /*#__PURE__*/React.createElement("span", {
    className: "mds-badge mds-badge--live"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mds-badge__dot",
    "aria-hidden": "true"
  }), liveLabel);else if (state === 'ended') badge = /*#__PURE__*/React.createElement("span", {
    className: "mds-badge mds-badge--ghost"
  }, endedLabel);else if (state === 'cancelled') badge = /*#__PURE__*/React.createElement("span", {
    className: "mds-badge mds-badge--outline"
  }, cancelledLabel);else if (valid) badge = /*#__PURE__*/React.createElement("span", {
    className: "mds-badge mds-badge--secondary"
  }, /*#__PURE__*/React.createElement("time", {
    dateTime: startsAt
  }, countdown(locale, at, nowAt, timeZone)));

  // ------------------------------------------------ what stands where the join button goes
  const status = (text, extra) => /*#__PURE__*/React.createElement("p", {
    className: ['mds-join__status', extra].filter(Boolean).join(' ')
  }, text);
  const open = state === 'upcoming' || state === 'live';
  const windowOpen = state === 'live' || !valid || at - nowAt <= joinWindowMinutes * MINUTE;
  // An unknown host prints "Bilinmeyen platform" and the host (MDS-DOM-03).
  const known = platform === 'unknown' ? undefined : platformLabels[platform];
  const chip = !locked && open && platform && /*#__PURE__*/React.createElement("span", {
    className: `mds-platform-chip mds-platform-chip--${platform}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "mds-platform-chip__dot",
    "aria-hidden": "true"
  }), platformLabel ?? known ?? platformLabels.unknown, !known && host && /*#__PURE__*/React.createElement("span", {
    className: "mds-platform-chip__host",
    dir: "ltr"
  }, host));
  let body = null;
  if (state === 'cancelled') body = status(cancelledText);else if (locked) body = /*#__PURE__*/React.createElement("div", {
    className: "mds-join__action"
  }, status(lockedReason, 'mds-join__status--locked'), action);else if (state === 'ended') {
    body = recordingsHref ? /*#__PURE__*/React.createElement("a", {
      className: "mds-btn mds-btn--secondary mds-btn--large mds-btn--full",
      href: recordingsHref
    }, recordingsLabel) : null;
  } else if (!href) body = status(noLinkText);else if (!windowOpen) body = status(joinOpensText.replace('{minutes}', new Intl.NumberFormat(locale).format(joinWindowMinutes)));else {
    body = /*#__PURE__*/React.createElement("div", {
      className: "mds-join__action"
    }, /*#__PURE__*/React.createElement("a", {
      className: "mds-btn mds-btn--primary mds-btn--large mds-btn--full mds-join__link",
      href: href,
      target: "_blank",
      rel: "noopener noreferrer"
    }, joinLabel, /*#__PURE__*/React.createElement("span", {
      className: "mds-visually-hidden"
    }, newTabLabel)), /*#__PURE__*/React.createElement("details", {
      className: "mds-join__reveal"
    }, /*#__PURE__*/React.createElement("summary", null, revealLabel), /*#__PURE__*/React.createElement("p", {
      className: "mds-join__url",
      dir: "ltr"
    }, href)));
  }

  // ------------------------------------------------ a link changed within the last 24 hours
  let notice = null;
  const updated = linkUpdatedAt ? new Date(linkUpdatedAt) : null;
  if (!locked && open && href && updated && nowAt - updated >= 0 && nowAt - updated < 24 * HOUR) {
    const when = new Intl.RelativeTimeFormat(locale, {
      numeric: 'auto'
    }).format(dayNumber(updated, timeZone) - dayNumber(nowAt, timeZone), 'day');
    notice = /*#__PURE__*/React.createElement("p", {
      className: "mds-join__notice"
    }, linkUpdatedText.replace('{when}', when));
  }
  const cls = ['mds-join', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("section", _extends({
    ref: ref,
    className: cls,
    "aria-labelledby": labelledBy
  }, rest), /*#__PURE__*/React.createElement("header", {
    className: "mds-join__header"
  }, /*#__PURE__*/React.createElement("p", {
    className: "mds-eyebrow",
    id: eyebrowId
  }, label), badge, actions && /*#__PURE__*/React.createElement("div", {
    className: "mds-join__actions"
  }, actions)), title && /*#__PURE__*/React.createElement(Heading, {
    className: "mds-join__title",
    id: headingId,
    dir: "auto"
  }, title), times.length > 0 && /*#__PURE__*/React.createElement("p", {
    className: "mds-join__time"
  }, valid ? /*#__PURE__*/React.createElement(React.Fragment, null, times[0], joinRun(times.slice(1))) : joinRun(times)), chip, body, notice);
}
Object.assign(__ds_scope, { SessionJoin });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/SessionJoin.jsx", error: String((e && e.message) || e) }); }

// components/Skeleton.jsx
try { (() => {
/* One .mds-skeleton bar, always hidden from assistive technology. The size is two data variables
   the class layer reads (--mds-skeleton-w, --mds-skeleton-h), each a CSS length string. */
function Skeleton({
  width,
  height,
  className = ''
}) {
  const vars = {};
  if (width != null) vars['--mds-skeleton-w'] = width;
  if (height != null) vars['--mds-skeleton-h'] = height;
  return /*#__PURE__*/React.createElement("div", {
    className: ['mds-skeleton', className].filter(Boolean).join(' '),
    style: vars,
    "aria-hidden": "true"
  });
}
Object.assign(__ds_scope, { Skeleton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Skeleton.jsx", error: String((e && e.message) || e) }); }

// components/Stat.jsx
try { (() => {
// The page's locale (MDS-NUM-01): the locale prop, else the nearest lang once mounted, else tr-TR.
function usePageLocale(ref, locale) {
  const [found, setFound] = React.useState(null);
  React.useEffect(() => {
    const el = ref.current && ref.current.closest('[lang]');
    setFound(el && el.lang || null);
  }, []);
  return locale || found || 'tr-TR';
}
function formatNumber(n, locale) {
  try {
    return new Intl.NumberFormat(locale).format(n);
  } catch (e) {
    return new Intl.NumberFormat('tr-TR').format(n);
  }
}

/* A number on a card. A tone colours the number only beside its cue, an icon or a delta label
   printed first: colour alone never says good or bad (MDS-COL-03), so without a cue it is neutral. */
function Stat({
  label,
  value,
  tone = 'neutral',
  cue,
  locale,
  children,
  className = ''
}) {
  const ref = React.useRef(null);
  const lang = usePageLocale(ref, locale);
  const shown = cue ? tone : 'neutral';
  const cls = ['mds-card', 'mds-stat', shown !== 'neutral' && `mds-stat--${shown}`, className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    className: cls
  }, /*#__PURE__*/React.createElement("span", {
    className: "mds-caption"
  }, label), /*#__PURE__*/React.createElement("span", {
    className: "mds-stat__value"
  }, cue && /*#__PURE__*/React.createElement("span", {
    className: "mds-stat__cue"
  }, cue), typeof value === 'number' ? formatNumber(value, lang) : value), children);
}
Object.assign(__ds_scope, { Stat });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Stat.jsx", error: String((e && e.message) || e) }); }

// components/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `s${++seq}`)[0]);

/* A native checkbox with role="switch", inside its own <label class="mds-choice">.
   The checked state is announced as on/off by the platform, so the component
   writes no words of its own. Native attributes go to the <input>; className goes
   to the label. */
function Switch({
  label,
  description,
  className = '',
  ...rest
}) {
  const uid = useUid().replace(/[^\w-]/g, '');
  const labelId = `mds-choice-${uid}-l`;
  const descId = `mds-choice-${uid}-d`;
  const labelledBy = [rest['aria-labelledby'], labelId].filter(Boolean).join(' ');
  const describedBy = [rest['aria-describedby'], description && descId].filter(Boolean).join(' ') || undefined;
  return /*#__PURE__*/React.createElement("label", {
    className: ['mds-choice', className].filter(Boolean).join(' ')
  }, /*#__PURE__*/React.createElement("input", _extends({}, rest, {
    type: "checkbox",
    role: "switch",
    className: "mds-switch",
    "aria-labelledby": labelledBy,
    "aria-describedby": describedBy
  })), /*#__PURE__*/React.createElement("span", {
    className: "mds-choice__text"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mds-choice__label",
    id: labelId
  }, label), description && /*#__PURE__*/React.createElement("span", {
    className: "mds-choice__desc",
    id: descId
  }, description)));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Switch.jsx", error: String((e && e.message) || e) }); }

// components/SystemState.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Ids must be unique per instance. React.useId where it exists; a module counter
// only for a React without it.
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `s${++seq}`)[0]);

/* A page that is only a state. Without the app shell it is the page's <main>;
   inside the shell, which owns <main>, it is a <section>. */
function SystemState({
  kind,
  title,
  children,
  action,
  logo,
  shell = false,
  headingLevel = 1,
  className = '',
  ...rest
}) {
  const id = `mds-system-state-${useUid().replace(/[^\w-]/g, '')}`;
  // restricted (B15) replaces the whole app: never inside the shell, and no way out of it.
  const restricted = kind === 'restricted';
  const Region = shell && !restricted ? 'section' : 'main';
  const Heading = `h${headingLevel}`;
  const cls = ['mds-system-state', Region === 'main' && 'mds-system-state--page', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement(Region, _extends({}, rest, {
    className: cls,
    "aria-labelledby": id
  }), logo, /*#__PURE__*/React.createElement(Heading, {
    className: headingLevel === 1 ? 'mds-h1' : 'mds-h2',
    id: id
  }, title), /*#__PURE__*/React.createElement("p", {
    className: "mds-system-state__text"
  }, children), !restricted && action);
}
Object.assign(__ds_scope, { SystemState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/SystemState.jsx", error: String((e && e.message) || e) }); }

// components/Table.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// The caption id must be unique per instance. React.useId where it exists; a
// module counter only for a React without it.
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `t${++seq}`)[0]);

/* Wraps .mds-table in its frame. Sorting is the caller's: Table draws the state and
   reports the click. responsive="stack" draws each row as a card below 768, and so adds
   the explicit table roles that display: block can drop. */
function Table({
  columns = [],
  rows = [],
  caption,
  captionVisible = false,
  empty = 'Bu listede henüz bir şey yok.',
  rowKey = (_, i) => i,
  sort,
  onSortChange,
  responsive = 'scroll',
  className = ''
}) {
  const captionId = `mds-table-${useUid().replace(/[^\w-]/g, '')}`;
  const wrap = React.useRef(null);
  const [scrolls, setScrolls] = React.useState(false);

  // The frame is a focusable region, named by the caption, only while the table itself is
  // wider than it: the frame's scrollWidth would also count a positioned descendant's overflow.
  React.useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const check = () => setScrolls(Boolean(el.firstElementChild) && el.firstElementChild.offsetWidth > el.clientWidth);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    check();
    return () => ro.disconnect();
  }, []);
  const stack = responsive === 'stack';
  const role = r => stack ? r : undefined;
  const next = c => ({
    key: c.key,
    direction: sort && sort.key === c.key && sort.direction === 'ascending' ? 'descending' : 'ascending'
  });
  const region = scrolls ? {
    tabIndex: 0,
    role: 'region',
    'aria-labelledby': captionId
  } : {};
  return /*#__PURE__*/React.createElement("div", _extends({
    ref: wrap,
    className: ['mds-table-wrap', className].filter(Boolean).join(' ')
  }, region), /*#__PURE__*/React.createElement("table", {
    className: ['mds-table', stack && 'mds-table--stack'].filter(Boolean).join(' '),
    role: role('table'),
    "aria-labelledby": stack ? captionId : undefined
  }, /*#__PURE__*/React.createElement("caption", {
    id: captionId,
    className: ['mds-table__caption', !captionVisible && 'mds-visually-hidden'].filter(Boolean).join(' ')
  }, caption), columns.some(c => c.width) && /*#__PURE__*/React.createElement("colgroup", null, columns.map(c => /*#__PURE__*/React.createElement("col", {
    key: c.key,
    style: c.width ? {
      '--mds-col-w': c.width
    } : undefined
  }))), /*#__PURE__*/React.createElement("thead", {
    role: role('rowgroup')
  }, /*#__PURE__*/React.createElement("tr", {
    role: role('row')
  }, columns.map(c => /*#__PURE__*/React.createElement("th", {
    key: c.key,
    scope: "col",
    role: role('columnheader'),
    className: c.align === 'right' ? 'is-end' : undefined,
    "aria-sort": sort && sort.key === c.key ? sort.direction : undefined
  }, c.sortable ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "mds-table__sort",
    onClick: () => onSortChange && onSortChange(next(c))
  }, c.header, /*#__PURE__*/React.createElement("span", {
    className: "mds-table__sort-icon",
    "aria-hidden": "true"
  })) : c.header)))), /*#__PURE__*/React.createElement("tbody", {
    role: role('rowgroup')
  }, rows.length === 0 ? /*#__PURE__*/React.createElement("tr", {
    role: role('row')
  }, /*#__PURE__*/React.createElement("td", {
    role: role('cell'),
    className: "mds-table__empty",
    colSpan: columns.length
  }, empty)) : rows.map((row, i) => /*#__PURE__*/React.createElement("tr", {
    key: rowKey(row, i),
    role: role('row')
  }, columns.map(c => {
    const cls = [c.align === 'right' && 'is-end', c.emphasis && `mds-table__cell--${c.emphasis}`, c.primaryAction && 'mds-table__primary-action'].filter(Boolean).join(' ') || undefined;
    const content = c.render ? c.render(row, i) : row[c.key];
    return c.rowHeader ? /*#__PURE__*/React.createElement("th", {
      key: c.key,
      scope: "row",
      role: role('rowheader'),
      className: cls
    }, content) : /*#__PURE__*/React.createElement("td", {
      key: c.key,
      role: role('cell'),
      className: cls,
      "data-label": stack && typeof c.header === 'string' && c.header ? c.header : undefined
    }, content);
  }))))));
}
Object.assign(__ds_scope, { Table });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Table.jsx", error: String((e && e.message) || e) }); }

// components/Tabs.jsx
try { (() => {
// The page's locale (MDS-NUM-01): the locale prop, else the nearest lang once mounted, else tr-TR.
function usePageLocale(ref, locale) {
  const [found, setFound] = React.useState(null);
  React.useEffect(() => {
    const el = ref.current && ref.current.closest('[lang]');
    setFound(el && el.lang || null);
  }, [ref]);
  return locale || found || 'tr-TR';
}
function formatCount(n, locale) {
  try {
    return new Intl.NumberFormat(locale).format(n);
  } catch {
    return new Intl.NumberFormat('tr-TR').format(n);
  }
}

/* Wraps .mds-tabs. mode="tabs" is the APG tabs pattern: one tab stop, the arrow keys
   move and select (mirrored in RTL), Home and End jump. The caller renders the panels.
   mode="links" is navigation between pages: a named <nav> of links, no tab roles. */
function Tabs({
  tabs = [],
  value,
  onChange,
  label,
  idBase,
  mode = 'tabs',
  locale,
  className = ''
}) {
  const ref = React.useRef(null);
  const lang = usePageLocale(ref, locale);
  const cls = ['mds-tabs', className].filter(Boolean).join(' ');
  const count = t => t.count != null && /*#__PURE__*/React.createElement("span", {
    className: "mds-tab__count"
  }, formatCount(t.count, lang));
  if (mode === 'links') {
    return /*#__PURE__*/React.createElement("nav", {
      ref: ref,
      className: cls,
      "aria-label": label
    }, tabs.map(t => /*#__PURE__*/React.createElement("a", {
      key: t.value,
      className: "mds-tab",
      href: t.href,
      "aria-current": t.value === value ? 'page' : undefined
    }, t.label, count(t))));
  }

  // With no tab selected, the first one takes the tab stop.
  const stop = tabs.some(t => t.value === value) ? value : tabs[0] && tabs[0].value;
  const onKeyDown = e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const list = [...e.currentTarget.querySelectorAll('[role="tab"]')];
    const at = list.indexOf(e.target);
    if (at < 0) return;
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const step = e.key === 'ArrowRight' !== rtl ? 1 : -1;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (at + step + list.length) % list.length;
    e.preventDefault();
    list[next].focus();
    if (onChange) onChange(tabs[next].value);
  };
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    className: cls,
    role: "tablist",
    "aria-label": label,
    onKeyDown: onKeyDown
  }, tabs.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.value,
    type: "button",
    role: "tab",
    id: `${idBase}-tab-${t.value}`,
    "aria-controls": `${idBase}-panel-${t.value}`,
    "aria-selected": t.value === value,
    tabIndex: t.value === stop ? 0 : -1,
    className: "mds-tab",
    onClick: () => onChange && onChange(t.value)
  }, t.label, count(t))));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Wraps .mds-input.mds-textarea: the input box, grown to rows and resizable in the
   block direction. Native attributes, aria-* included, go to the <textarea>. */
function Textarea({
  error = false,
  className = '',
  ...rest
}) {
  const cls = ['mds-input', 'mds-textarea', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("textarea", _extends({
    className: cls,
    "aria-invalid": error || undefined
  }, rest));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/Toast.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// Success and info close themselves after 6 s, or 10 s when they offer an action; the
// timer pauses while the pointer or the focus is on the toast. Warning and error stay
// until someone closes them.
const dwell = 6000;
const dwellWithAction = 10000;

/* One toast. It renders inside the app's single <Toaster>, whose live regions
   announce it; on its own it is announced by nothing. */
function Toast({
  tone = 'success',
  title,
  description,
  action,
  onClose,
  closeLabel = 'Kapat',
  className = '',
  ...rest
}) {
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const left = React.useRef(action ? dwellWithAction : dwell);
  const close = React.useRef(onClose);
  React.useEffect(() => {
    close.current = onClose;
  });
  const timed = Boolean(onClose) && tone !== 'warning' && tone !== 'error';
  React.useEffect(() => {
    if (!timed || hovered || focused) return undefined;
    const started = Date.now();
    const timer = setTimeout(() => close.current?.(), left.current);
    return () => {
      clearTimeout(timer);
      left.current -= Date.now() - started;
    };
  }, [timed, hovered, focused]);
  const cls = ['mds-toast', `mds-toast--${tone}`, className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("div", _extends({}, rest, {
    className: cls,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onFocus: () => setFocused(true),
    onBlur: event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "mds-toast__icon",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("div", {
    className: "mds-toast__body"
  }, /*#__PURE__*/React.createElement("p", {
    className: "mds-toast__title"
  }, title), description && /*#__PURE__*/React.createElement("p", {
    className: "mds-toast__desc"
  }, description), action && /*#__PURE__*/React.createElement("div", {
    className: "mds-toast__action"
  }, action)), onClose && /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "mds-btn mds-icon-btn mds-btn--mini mds-btn--ghost mds-toast__close",
    "aria-label": closeLabel,
    onClick: onClose
  }));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Toast.jsx", error: String((e && e.message) || e) }); }

// components/Toaster.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const urgent = toast => toast.props.tone === 'warning' || toast.props.tone === 'error';

/* The live-region host, mounted once per app before any toast. Its children are the
   current toasts, oldest first: the newest three show, success and info in the polite
   region, warning and error in the assertive one. */
function Toaster({
  label = 'Bildirimler',
  children,
  className = '',
  ...rest
}) {
  const ref = React.useRef(null);
  const toasts = React.Children.toArray(children).filter(React.isValidElement).slice(-3);
  const shown = toasts.length > 0;

  // While a toast shows, the height it covers reaches <html> as --mds-fixed-end, which
  // base.css turns into scroll padding, so a focused control never sits under it
  // (MDS-A11Y-09). The value another fixed layer set there comes back when it empties.
  React.useEffect(() => {
    const el = ref.current;
    if (!shown || !el || typeof ResizeObserver !== 'function') return undefined;
    const root = document.documentElement;
    const before = root.style.getPropertyValue('--mds-fixed-end');
    const report = () => {
      const covered = Math.ceil(window.innerHeight - el.getBoundingClientRect().top);
      root.style.setProperty('--mds-fixed-end', `${Math.max(covered, Number.parseFloat(before) || 0)}px`);
    };
    const observer = new ResizeObserver(report);
    observer.observe(el);
    window.addEventListener('resize', report);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', report);
      if (before) root.style.setProperty('--mds-fixed-end', before);else root.style.removeProperty('--mds-fixed-end');
    };
  }, [shown]);
  return /*#__PURE__*/React.createElement("section", _extends({}, rest, {
    ref: ref,
    className: ['mds-toaster', className].filter(Boolean).join(' '),
    "aria-label": label
  }), /*#__PURE__*/React.createElement("div", {
    role: "status",
    "aria-atomic": "false"
  }, toasts.filter(toast => !urgent(toast))), /*#__PURE__*/React.createElement("div", {
    role: "alert",
    "aria-atomic": "false"
  }, toasts.filter(urgent)));
}
Object.assign(__ds_scope, { Toaster });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Toaster.jsx", error: String((e && e.message) || e) }); }

// components/Tooltip.jsx
try { (() => {
// The tooltip id must be unique per instance. React.useId where it exists; a
// module counter only for a React without it.
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `t${++seq}`)[0]);

// Keeps a shown bubble inside the viewport and every clipping ancestor (a table frame, a dialog,
// a scrolling body), measured once it shows. Clipped above or below, it moves to the other side
// when it fits there (data-placement); clipped sideways, it shifts by a data variable the class
// layer reads.
function place(anchor) {
  const tip = anchor && anchor.querySelector(':scope > .mds-tooltip');
  if (!tip) return;
  tip.style.removeProperty('--mds-tooltip-shift');
  anchor.removeAttribute('data-placement');
  let r = tip.getBoundingClientRect();
  if (!r.width) return;
  const root = document.documentElement;
  let lo = 8;
  let hi = root.clientWidth - 8;
  let top = 0;
  let bottom = root.clientHeight;
  for (let el = anchor.parentElement; el && el !== document.body; el = el.parentElement) {
    const s = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    if (s.overflowX !== 'visible') {
      lo = Math.max(lo, b.left + el.clientLeft);
      hi = Math.min(hi, b.left + el.clientLeft + el.clientWidth);
    }
    if (s.overflowY !== 'visible') {
      top = Math.max(top, b.top + el.clientTop);
      bottom = Math.min(bottom, b.top + el.clientTop + el.clientHeight);
    }
  }
  const a = anchor.getBoundingClientRect();
  const gap = a.top - r.bottom >= 0 ? a.top - r.bottom : r.top - a.bottom;
  const above = r.bottom <= a.top;
  if (above && r.top < top && a.bottom + gap + r.height <= bottom) anchor.setAttribute('data-placement', 'bottom');
  if (!above && r.bottom > bottom && a.top - gap - r.height >= top) anchor.setAttribute('data-placement', 'top');
  if (anchor.hasAttribute('data-placement')) r = tip.getBoundingClientRect();
  const shift = r.left < lo ? lo - r.left : r.right > hi ? Math.max(hi - r.right, lo - r.left) : 0;
  if (shift) tip.style.setProperty('--mds-tooltip-shift', `${Math.round(shift)}px`);
}

/* Wraps one focusable element in .mds-tooltip-anchor. The tooltip shows on hover and keyboard focus,
   stays while the pointer is on it, and Esc hides it until the pointer leaves or focus moves
   (WCAG 1.4.13, MDS-A11Y-10). It describes its child unless `describes` is off. */
function Tooltip({
  label,
  children,
  describes = true,
  placement = 'top',
  className = ''
}) {
  const id = `mds-tooltip-${useUid()}`;
  const anchor = React.useRef(null);
  const [dismissed, setDismissed] = React.useState(false);
  React.useEffect(() => {
    // Capture phase, and the key is consumed while the bubble shows: inside a modal Dialog the
    // same Esc would otherwise also close the dialog.
    const onKey = e => {
      const a = anchor.current;
      if (e.key !== 'Escape' || !a || a.hasAttribute('data-dismissed') || !a.matches(':hover, :has(:focus-visible)')) return;
      e.preventDefault();
      setDismissed(true);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
  const reset = () => setDismissed(false);
  const show = () => requestAnimationFrame(() => place(anchor.current));
  const child = React.Children.only(children);
  const own = child.props['aria-describedby'];
  const trigger = describes ? React.cloneElement(child, {
    'aria-describedby': own ? `${own} ${id}` : id
  }) : child;
  const cls = ['mds-tooltip-anchor', placement === 'bottom' && 'mds-tooltip-anchor--bottom', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("span", {
    ref: anchor,
    className: cls,
    "data-dismissed": dismissed ? '' : undefined,
    onMouseEnter: show,
    onFocus: show,
    onMouseLeave: reset,
    onBlur: reset
  }, trigger, /*#__PURE__*/React.createElement("span", {
    className: "mds-tooltip",
    role: "tooltip",
    id: id,
    "aria-hidden": describes ? undefined : 'true'
  }, label));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/WeekAccordion.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// The ids must be unique per instance. React.useId where it exists; a module
// counter only for a React without it.
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `w${++seq}`)[0]);

// The page's locale (MDS-NUM-01): the locale prop, else the nearest lang once mounted, else tr-TR.
function usePageLocale(ref, locale) {
  const [found, setFound] = React.useState(null);
  React.useEffect(() => {
    const el = ref.current && ref.current.closest('[lang]');
    setFound(el && el.lang || null);
  }, []);
  return locale || found || 'tr-TR';
}

// A meta run: each part but the last ends on its separator, so a wrapped line ends on the dot and
// never starts with it.
function joinRun(parts) {
  return parts.map((p, i) => i < parts.length - 1 ? /*#__PURE__*/React.createElement("span", {
    key: `run${i}`
  }, p, /*#__PURE__*/React.createElement("span", {
    className: "mds-sep",
    "aria-hidden": "true"
  }, "\xB7")) : p);
}

// A date-only value ("2026-10-17") is that calendar day wherever the viewer is.
function openDate(iso, locale) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    ...(dateOnly && {
      timeZone: 'UTC'
    })
  }).format(at);
}
function WeekAccordion({
  week,
  title,
  state = 'default',
  access = 'open',
  opensOn,
  summary,
  meta,
  open,
  defaultOpen = state === 'active',
  onToggle,
  headingLevel = 3,
  region = false,
  weekLabel = 'Hafta {week}',
  activeLabel = 'Devam ediyor',
  doneLabel = 'Tamamlandı',
  lockedLabel = ', kilitli',
  opensOnLabel = '{date} tarihinde açılır',
  emptyLabel = 'Bu hafta için henüz celse eklenmedi.',
  locale: localeProp,
  children,
  className = '',
  ...rest
}) {
  const ref = React.useRef(null);
  const locale = usePageLocale(ref, localeProp);
  const [own, setOwn] = React.useState(defaultOpen);
  const isOpen = open ?? own;
  const uid = useUid().replace(/[^\w-]/g, '');
  const buttonId = `mds-week-${uid}-b`;
  const panelId = `mds-week-${uid}-p`;
  const locked = access === 'locked';
  // locked wins: a viewer who may not open the lessons has no progress in them
  const shown = locked ? 'locked' : state;
  const cls = ['mds-week', shown !== 'default' && `is-${shown}`, className].filter(Boolean).join(' ');
  const Heading = `h${[2, 3, 4].includes(headingLevel) ? headingLevel : 3}`;
  const n = new Intl.NumberFormat(locale).format(week);
  const toggle = () => {
    if (open === undefined) setOwn(!isOpen);
    if (onToggle) onToggle(!isOpen);
  };
  const metaItems = [];
  if (opensOn) {
    const [before, after = ''] = opensOnLabel.split('{date}');
    metaItems.push(/*#__PURE__*/React.createElement("span", {
      key: "opens"
    }, before, /*#__PURE__*/React.createElement("time", {
      dateTime: opensOn
    }, openDate(opensOn, locale)), after));
  }
  if (meta) metaItems.push(/*#__PURE__*/React.createElement("span", {
    key: "meta"
  }, meta));
  const rows = React.Children.toArray(children);
  return /*#__PURE__*/React.createElement("div", _extends({
    ref: ref,
    className: cls
  }, rest), /*#__PURE__*/React.createElement(Heading, {
    className: "mds-week__heading"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "mds-week__trigger",
    id: buttonId,
    "aria-expanded": isOpen,
    "aria-controls": panelId,
    onClick: toggle
  }, /*#__PURE__*/React.createElement("span", {
    className: "mds-week__medallion",
    "aria-hidden": "true"
  }, shown === 'done' || shown === 'locked' ? null : n), /*#__PURE__*/React.createElement("span", {
    className: "mds-week__titles"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mds-week__eyebrow"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mds-eyebrow"
  }, weekLabel.replace('{week}', n)), shown === 'active' && /*#__PURE__*/React.createElement("span", {
    className: "mds-badge mds-badge--brand"
  }, activeLabel), shown === 'done' && /*#__PURE__*/React.createElement("span", {
    className: "mds-badge mds-badge--success"
  }, doneLabel)), /*#__PURE__*/React.createElement("span", {
    className: "mds-week__title",
    dir: "auto"
  }, title), locked && /*#__PURE__*/React.createElement("span", {
    className: "mds-visually-hidden"
  }, lockedLabel)), metaItems.length > 0 && /*#__PURE__*/React.createElement("span", {
    className: "mds-week__meta"
  }, joinRun(metaItems)), /*#__PURE__*/React.createElement("span", {
    className: "mds-week__chevron",
    "aria-hidden": "true"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mds-week__panel",
    id: panelId,
    role: region ? 'region' : undefined,
    "aria-labelledby": region ? buttonId : undefined,
    hidden: !isOpen
  }, summary && /*#__PURE__*/React.createElement("p", {
    className: "mds-week__summary",
    dir: "auto"
  }, summary), rows.length ? /*#__PURE__*/React.createElement("ol", {
    className: "mds-lesson-list"
  }, rows) : /*#__PURE__*/React.createElement("p", {
    className: "mds-week__empty"
  }, emptyLabel)));
}
Object.assign(__ds_scope, { WeekAccordion });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/WeekAccordion.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Alert = __ds_scope.Alert;

__ds_ns.AppBar = __ds_scope.AppBar;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.AvatarStack = __ds_scope.AvatarStack;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Breadcrumb = __ds_scope.Breadcrumb;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.ChoiceChips = __ds_scope.ChoiceChips;

__ds_ns.CoverPattern = __ds_scope.CoverPattern;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.LessonRow = __ds_scope.LessonRow;

__ds_ns.Logo = __ds_scope.Logo;

__ds_ns.NavItem = __ds_scope.NavItem;

__ds_ns.NavSection = __ds_scope.NavSection;

__ds_ns.PlatformChip = __ds_scope.PlatformChip;

__ds_ns.Progress = __ds_scope.Progress;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.RadioGroup = __ds_scope.RadioGroup;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.SessionJoin = __ds_scope.SessionJoin;

__ds_ns.Skeleton = __ds_scope.Skeleton;

__ds_ns.Stat = __ds_scope.Stat;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.SystemState = __ds_scope.SystemState;

__ds_ns.Table = __ds_scope.Table;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Toaster = __ds_scope.Toaster;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.WeekAccordion = __ds_scope.WeekAccordion;

})();
