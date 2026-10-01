import React from 'react';

// Avatar's initials, repeated here because a component file stands alone (MDS-COMP-06).
const particles = new Set(['b.', 'bin', 'ibn', 'bt.', 'bint']);
// Honorifics after the name take no letter either: "İsmail Hakkı Efendi" → İH.
const honorifics = new Set(['Efendi', 'Bey', 'Hanım', 'Hoca']);
function initials(name = '', locale = 'tr-TR') {
  const words = name.normalize('NFC').trim().split(/\s+/).filter((w) => w && !particles.has(w) && !honorifics.has(w));
  const letters = (words.length > 1 ? [words[0], words[words.length - 1]] : words).map((w) => Array.from(w)[0]).join('');
  try { return letters.toLocaleUpperCase(locale); } catch (e) { return letters.toLocaleUpperCase('tr-TR'); }
}

// The page's locale (MDS-NUM-01): the locale prop, else the nearest lang once mounted, else tr-TR.
function usePageLocale(ref, locale) {
  const [found, setFound] = React.useState(null);
  React.useEffect(() => {
    const el = ref.current && ref.current.closest('[lang]');
    setFound((el && el.lang) || null);
  }, []);
  return locale || found || 'tr-TR';
}

/* Small overlapping avatars, drawn as .mds-avatar markup (it cannot use Avatar, MDS-COMP-06), and a
   last tile counting the rest: +N = total − shown. With a label the stack is a named group. */
export function AvatarStack({ people = [], max = 3, total, label, locale, className = '' }) {
  const ref = React.useRef(null);
  const lang = usePageLocale(ref, locale);
  const shown = people.slice(0, Math.max(0, max));
  const more = Math.max(0, (total != null ? total : people.length) - shown.length);
  let count = String(more);
  try { count = new Intl.NumberFormat(lang).format(more); } catch (e) { /* keep the digits */ }
  return (
    <span ref={ref} className={['mds-avatar-stack', className].filter(Boolean).join(' ')} {...(label ? { role: 'group', 'aria-label': label } : {})}>
      {shown.map((p, i) => (
        <span key={i} className="mds-avatar mds-avatar--sm" {...(p.name ? { role: 'img', 'aria-label': p.name } : { 'aria-hidden': 'true' })}>
          {p.src ? <img src={p.src} alt="" /> : initials(p.name, lang)}
        </span>
      ))}
      {more > 0 && (
        <span className="mds-avatar mds-avatar--sm mds-avatar--more" aria-hidden={label ? 'true' : undefined}>+{count}</span>
      )}
    </span>
  );
}
