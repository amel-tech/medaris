import React from 'react';

// assets/logo-arabic.svg: مدارس as outlined paths, so a Latin-only page never loads the Naskh file for the logo.
const ARABIC_VIEWBOX = '68 -677 2527 932';
const ARABIC_PATH = 'M250 255Q163 255 116 204Q68 153 68 56Q68 38 70 18Q72 -2 78 -27Q83 -52 91 -84L133 -74Q120 -27 120 3Q120 75 154 112Q187 149 253 149Q305 149 350 138Q394 126 432 104Q469 81 497 48Q464 -20 442 -68Q419 -116 419 -138Q419 -174 440 -202Q461 -231 508 -255Q510 -242 513 -223Q516 -204 521 -176Q526 -149 532 -111Q549 -108 564 -106Q579 -105 592 -105Q615 -105 630 -107Q646 -109 669 -115Q677 -129 691 -166Q700 -193 708 -214Q716 -234 722 -250Q728 -266 738 -272Q749 -279 766 -279Q785 -279 799 -270Q792 -255 781 -222Q770 -188 756 -143Q798 -123 842 -114Q885 -104 940 -100Q931 -121 920 -144Q910 -168 898 -194Q886 -218 878 -238Q870 -257 870 -273Q870 -296 894 -323Q918 -350 953 -369Q959 -338 966 -304Q973 -270 979 -240Q986 -205 990 -179Q994 -153 994 -136Q994 -122 988 -97Q982 -72 972 -46Q963 -19 953 0Q891 0 833 -12Q775 -25 723 -48L713 -28Q706 -16 669 -8Q650 -4 628 -2Q606 0 580 0Q572 0 564 -0Q555 -1 546 -2V10Q546 75 506 132Q467 189 398 222Q364 239 327 247Q290 255 250 255Z M1150 198Q1137 198 1115 188Q1093 179 1066 162Q1040 145 1016 125L1031 86Q1058 93 1083 96Q1108 99 1130 99Q1204 99 1256 60Q1308 20 1332 -55Q1325 -70 1317 -86Q1309 -101 1299 -117Q1269 -167 1248 -206Q1227 -246 1227 -276Q1227 -304 1248 -328Q1268 -352 1302 -369Q1307 -350 1316 -324Q1324 -297 1334 -271Q1343 -245 1350 -224Q1363 -188 1372 -152Q1380 -117 1380 -86Q1380 -8 1350 58Q1320 123 1268 161Q1215 198 1150 198Z M1540 -6Q1537 -104 1532 -182Q1528 -261 1524 -329Q1519 -397 1514 -460Q1509 -523 1502 -591Q1499 -616 1510 -635Q1522 -654 1544 -664Q1567 -675 1595 -677Q1602 -650 1612 -618Q1622 -587 1634 -555L1602 -530Q1605 -469 1606 -392Q1606 -315 1604 -221Q1603 -127 1598 -14Z M1858 0Q1728 0 1728 -73Q1728 -93 1735 -113Q1742 -133 1754 -145Q1779 -125 1811 -115Q1843 -105 1890 -105Q1920 -105 1952 -109Q1983 -113 2016 -121Q1990 -166 1970 -210Q1951 -254 1940 -290Q1929 -326 1929 -345Q1929 -377 1945 -400Q1961 -423 1993 -433Q2014 -350 2036 -285Q2057 -220 2084 -173Q2103 -138 2126 -124Q2148 -110 2184 -110Q2192 -110 2192 -102V-14Q2192 -6 2184 -6Q2147 -6 2118 -18Q2088 -30 2065 -54Q1961 0 1858 0Z M2539 0Q2496 0 2451 -7Q2406 -14 2365 -28Q2324 -41 2293 -57Q2269 -30 2242 -18Q2214 -6 2175 -6Q2167 -6 2167 -14V-102Q2167 -110 2175 -110Q2215 -110 2244 -128Q2273 -147 2292 -184Q2306 -211 2316 -231Q2327 -251 2336 -266Q2345 -282 2354 -295Q2379 -328 2402 -342Q2426 -357 2455 -357Q2489 -357 2522 -320Q2554 -283 2575 -223Q2595 -165 2595 -110Q2595 -82 2580 -51Q2564 -20 2539 0ZM2510 -99Q2507 -139 2494 -174Q2482 -210 2467 -231Q2452 -249 2440 -249Q2413 -249 2391 -222Q2383 -212 2371 -192Q2359 -172 2344 -142Q2377 -126 2418 -115Q2459 -104 2510 -99Z';

// The subtitle an app gets when the caller passes none. The landing page has none.
const appNames = { tedris: 'Tedris', nizam: 'Nizam', nazir: 'Nazır', giris: 'Giriş' };

/* Wraps .mds-logo: the mark, the same as assets/logo-mark.svg. It follows the theme through its classes
   (an ink page by day, a paper page by night). At lg the wordmark lockup adds مدارس, and the app's name is
   not drawn unless the caller passes a subtitle. */
export function Logo({ app, size = 'md', wordmark = false, subtitle = size === 'lg' ? undefined : appNames[app], className = '', ...rest }) {
  const cls = ['mds-logo', size !== 'md' && `mds-logo--${size}`, className].filter(Boolean).join(' ');
  return (
    <span className={cls} role="img" aria-label={subtitle ? `Medaris — ${subtitle}` : 'Medaris'} {...rest}>
      <svg className="mds-logo__mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <rect className="mds-logo__ground" width="48" height="48" rx="3" />
        <rect className="mds-logo__rule" x="5.5" y="5.5" width="37" height="37" strokeWidth="1.5" />
        <rect className="mds-logo__rule mds-logo__rule--inner" x="9.5" y="9.5" width="29" height="29" strokeWidth="1" />
        <path className="mds-logo__nokta" d="M24 15.5 32.5 24 24 32.5 15.5 24Z" />
      </svg>
      {wordmark && (
        <span className="mds-logo__text">
          <span className="mds-logo__word" lang="en" dir="ltr">Medaris</span>
          {size === 'lg' && (
            <svg className="mds-logo__arabic" viewBox={ARABIC_VIEWBOX} aria-hidden="true" focusable="false">
              <path d={ARABIC_PATH} />
            </svg>
          )}
          {subtitle && <span className="mds-logo__subtitle" dir="auto">{subtitle}</span>}
        </span>
      )}
    </span>
  );
}
