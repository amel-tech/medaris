import React from 'react';

// Lower-case name particles that take no letter: "Ahmed b. Hanbel" → AH.
const particles = new Set(['b.', 'bin', 'ibn', 'bt.', 'bint']);
// Honorifics after the name take no letter either: "İsmail Hakkı Efendi" → İH.
const honorifics = new Set(['Efendi', 'Bey', 'Hanım', 'Hoca']);

/** Initials: the first letters of the first and the last word that is not a particle or an
    honorific, upper-cased in the page's locale (tr-TR: i becomes İ). A double given name keeps
    the surname: "Zeynep Kübra Demirci" → ZD. */
export function initials(name = '', locale = 'tr-TR') {
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

export function Avatar({ name, src, size = 'md', decorative = false, entity = false, locale, className = '', ...rest }) {
  const ref = React.useRef(null);
  const lang = usePageLocale(ref, locale);
  const cls = ['mds-avatar', size !== 'md' && `mds-avatar--${size}`, entity && 'mds-avatar--entity', className]
    .filter(Boolean).join(' ');
  // Standalone, the avatar is an image named by the person; beside the printed name it is hidden.
  const a11y = decorative || !name ? { 'aria-hidden': 'true' } : { role: 'img', 'aria-label': name };
  return (
    <span ref={ref} className={cls} {...a11y} {...rest}>
      {src ? <img src={src} alt="" /> : initials(name, lang)}
    </span>
  );
}
