/* @ds-bundle: {"format":4,"namespace":"MedarisDesignSystem_628e07","components":[{"name":"Alert","sourcePath":"components/Alert.jsx"},{"name":"Avatar","sourcePath":"components/Avatar.jsx"},{"name":"AvatarStack","sourcePath":"components/Avatar.jsx"},{"name":"Badge","sourcePath":"components/Badge.jsx"},{"name":"Button","sourcePath":"components/Button.jsx"},{"name":"IconButton","sourcePath":"components/Button.jsx"},{"name":"Card","sourcePath":"components/Card.jsx"},{"name":"Stat","sourcePath":"components/Card.jsx"},{"name":"Input","sourcePath":"components/Input.jsx"},{"name":"Textarea","sourcePath":"components/Input.jsx"},{"name":"Field","sourcePath":"components/Input.jsx"},{"name":"NavItem","sourcePath":"components/NavItem.jsx"},{"name":"NavSection","sourcePath":"components/NavItem.jsx"},{"name":"Progress","sourcePath":"components/Progress.jsx"},{"name":"Skeleton","sourcePath":"components/Progress.jsx"},{"name":"Table","sourcePath":"components/Table.jsx"},{"name":"Tabs","sourcePath":"components/Tabs.jsx"}],"sourceHashes":{"components/Alert.jsx":"181a3c4e8092","components/Avatar.jsx":"52292e58014a","components/Badge.jsx":"0f7949b90e2d","components/Button.jsx":"251e97e9425e","components/Card.jsx":"744a057400bb","components/Input.jsx":"9a534964a832","components/NavItem.jsx":"141707cce131","components/Progress.jsx":"d60a32f85e57","components/Table.jsx":"cf86ee6427b2","components/Tabs.jsx":"7b994707d125"},"inlinedExternals":[],"unexposedExports":[{"name":"initials","sourcePath":"components/Avatar.jsx"}]} */

(() => {

const __ds_ns = (window.MedarisDesignSystem_628e07 = window.MedarisDesignSystem_628e07 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/Alert.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const icons = {
  info: /*#__PURE__*/React.createElement("path", {
    d: "M12 11v5M12 8h.01"
  }),
  success: /*#__PURE__*/React.createElement("path", {
    d: "M8 12.5l2.5 2.5L16 9.5"
  }),
  warning: /*#__PURE__*/React.createElement("path", {
    d: "M12 9v4M12 16h.01"
  }),
  error: /*#__PURE__*/React.createElement("path", {
    d: "M15 9l-6 6M9 9l6 6"
  })
};
function Alert({
  tone = 'info',
  title,
  children,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['mds-alert', `mds-alert--${tone}`, className].filter(Boolean).join(' '),
    role: tone === 'error' ? 'alert' : 'status'
  }, rest), /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      flex: 'none',
      marginTop: 1
    },
    "aria-hidden": "true"
  }, tone === 'warning' ? /*#__PURE__*/React.createElement("path", {
    d: "M12 3l9 16H3z"
  }) : /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), icons[tone]), /*#__PURE__*/React.createElement("div", null, title && /*#__PURE__*/React.createElement("p", {
    className: "mds-alert__title"
  }, title), children));
}
Object.assign(__ds_scope, { Alert });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Alert.jsx", error: String((e && e.message) || e) }); }

// components/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Initials from a Turkish name: first letter of the first two words. */
function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toLocaleUpperCase('tr-TR');
}
function Avatar({
  name,
  src,
  size = 'md',
  className = '',
  ...rest
}) {
  const cls = ['mds-avatar', size !== 'md' && `mds-avatar--${size}`, className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls,
    title: name
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name || ''
  }) : initials(name));
}
function AvatarStack({
  people = [],
  max = 3
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex'
    }
  }, shown.map((p, i) => /*#__PURE__*/React.createElement(Avatar, {
    key: p.name || i,
    name: p.name,
    src: p.src,
    size: "sm",
    style: {
      marginLeft: i ? -10 : 0,
      boxShadow: '0 0 0 2px var(--background-white)'
    }
  })), rest > 0 && /*#__PURE__*/React.createElement("span", {
    className: "mds-avatar mds-avatar--sm",
    style: {
      marginLeft: -10,
      boxShadow: '0 0 0 2px var(--background-white)',
      background: 'var(--background-neutral-tertiary)',
      color: 'var(--text-neutral-tertiary)'
    }
  }, "+", rest));
}
Object.assign(__ds_scope, { initials, Avatar, AvatarStack });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Badge({
  children,
  variant = 'secondary',
  icon,
  className = '',
  ...rest
}) {
  const cls = ['mds-badge', `mds-badge--${variant}`, className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls
  }, rest), icon, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Badge.jsx", error: String((e && e.message) || e) }); }

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
  disabled,
  className = '',
  ...rest
}) {
  const cls = ['mds-btn', `mds-btn--${size}`, `mds-btn--${variant}`, className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: cls,
    disabled: disabled
  }, rest), iconLeft, children, iconRight);
}
function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'regular',
  className = '',
  ...rest
}) {
  const cls = ['mds-btn', 'mds-icon-btn', `mds-btn--${size}`, `mds-btn--${variant}`, className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: cls,
    "aria-label": label,
    title: label
  }, rest), icon);
}
Object.assign(__ds_scope, { Button, IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Button.jsx", error: String((e && e.message) || e) }); }

// components/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Card({
  title,
  action,
  children,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['mds-card', className].filter(Boolean).join(' ')
  }, rest), (title || action) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 'var(--space-sm)'
    }
  }, title && /*#__PURE__*/React.createElement("h3", {
    className: "mds-card__title"
  }, title), action), children);
}
function Stat({
  label,
  value,
  tone = 'neutral',
  children
}) {
  const color = tone === 'error' ? 'var(--text-error-primary)' : tone === 'success' ? 'var(--text-success-primary)' : 'var(--text-neutral-primary)';
  return /*#__PURE__*/React.createElement("div", {
    className: "mds-card"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mds-caption"
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 6,
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--fs-h4)',
      fontWeight: 'var(--weight-bold)',
      lineHeight: 1,
      color
    }
  }, value), children);
}
Object.assign(__ds_scope, { Card, Stat });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Card.jsx", error: String((e && e.message) || e) }); }

// components/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input({
  size = 'regular',
  error = false,
  className = '',
  ...rest
}) {
  const cls = ['mds-input', size !== 'regular' && `mds-input--${size}`, error && 'is-error', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("input", _extends({
    className: cls,
    "aria-invalid": error || undefined
  }, rest));
}
function Textarea({
  error = false,
  className = '',
  ...rest
}) {
  const cls = ['mds-input', 'mds-textarea', error && 'is-error', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("textarea", _extends({
    className: cls,
    "aria-invalid": error || undefined
  }, rest));
}
let uid = 0;
function Field({
  label,
  help,
  error,
  children,
  className = ''
}) {
  const id = React.useMemo(() => `mds-f${++uid}`, []);
  const describedBy = error ? `${id}-e` : help ? `${id}-h` : undefined;
  return /*#__PURE__*/React.createElement("div", {
    className: ['mds-field', className].filter(Boolean).join(' ')
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "mds-label",
    htmlFor: id
  }, label), React.isValidElement(children) ? React.cloneElement(children, {
    id,
    error: Boolean(error),
    'aria-describedby': describedBy
  }) : children, error ? /*#__PURE__*/React.createElement("span", {
    className: "mds-error",
    id: `${id}-e`
  }, error) : help ? /*#__PURE__*/React.createElement("span", {
    className: "mds-help",
    id: `${id}-h`
  }, help) : null);
}
Object.assign(__ds_scope, { Input, Textarea, Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Input.jsx", error: String((e && e.message) || e) }); }

// components/NavItem.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function NavItem({
  icon,
  children,
  active = false,
  className = '',
  ...rest
}) {
  const cls = ['mds-nav-item', active && 'is-active', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("a", _extends({
    className: cls,
    "aria-current": active ? 'page' : undefined
  }, rest), icon, children);
}
function NavSection({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "mds-nav-section"
  }, children);
}
Object.assign(__ds_scope, { NavItem, NavSection });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/NavItem.jsx", error: String((e && e.message) || e) }); }

// components/Progress.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Progress({
  value = 0,
  label,
  className = '',
  ...rest
}) {
  const pct = Math.max(0, Math.min(100, value));
  return /*#__PURE__*/React.createElement("div", _extends({
    className: className
  }, rest), label && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 'var(--fs-caption)',
      color: 'var(--text-neutral-tertiary)',
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("span", null, pct, "%")), /*#__PURE__*/React.createElement("div", {
    className: "mds-progress",
    role: "progressbar",
    "aria-valuenow": pct,
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-label": typeof label === 'string' ? label : undefined
  }, /*#__PURE__*/React.createElement("div", {
    className: "mds-progress__bar",
    style: {
      width: `${pct}%`
    }
  })));
}
function Skeleton({
  width = '100%',
  height = 12,
  className = '',
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: ['mds-skeleton', className].filter(Boolean).join(' '),
    style: {
      width,
      height,
      ...style
    },
    "aria-hidden": "true"
  });
}
Object.assign(__ds_scope, { Progress, Skeleton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Progress.jsx", error: String((e && e.message) || e) }); }

// components/Table.jsx
try { (() => {
function Table({
  columns = [],
  rows = [],
  empty = 'Kayıt yok',
  rowKey = (_, i) => i
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px solid var(--border-neutral-primary)',
      borderRadius: 'var(--radius-m)',
      overflow: 'hidden',
      background: 'var(--background-white)'
    }
  }, /*#__PURE__*/React.createElement("table", {
    className: "mds-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map(c => /*#__PURE__*/React.createElement("th", {
    key: c.key,
    style: c.align === 'right' ? {
      textAlign: 'right'
    } : undefined
  }, c.header)))), /*#__PURE__*/React.createElement("tbody", null, rows.length === 0 ? /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: columns.length,
    style: {
      color: 'var(--text-neutral-tertiary)',
      textAlign: 'center',
      padding: 'var(--space-xl)'
    }
  }, empty)) : rows.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: rowKey(r, i)
  }, columns.map(c => /*#__PURE__*/React.createElement("td", {
    key: c.key,
    style: c.align === 'right' ? {
      textAlign: 'right'
    } : undefined
  }, c.render ? c.render(r) : r[c.key])))))));
}
Object.assign(__ds_scope, { Table });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Table.jsx", error: String((e && e.message) || e) }); }

// components/Tabs.jsx
try { (() => {
function Tabs({
  tabs = [],
  value,
  onChange,
  className = ''
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: ['mds-tabs', className].filter(Boolean).join(' '),
    role: "tablist"
  }, tabs.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.value,
    role: "tab",
    type: "button",
    "aria-selected": t.value === value,
    className: ['mds-tab', t.value === value && 'is-active'].filter(Boolean).join(' '),
    onClick: () => onChange && onChange(t.value)
  }, t.label)));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Tabs.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Alert = __ds_scope.Alert;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.AvatarStack = __ds_scope.AvatarStack;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Stat = __ds_scope.Stat;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.NavItem = __ds_scope.NavItem;

__ds_ns.NavSection = __ds_scope.NavSection;

__ds_ns.Progress = __ds_scope.Progress;

__ds_ns.Skeleton = __ds_scope.Skeleton;

__ds_ns.Table = __ds_scope.Table;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
