import { type HTMLAttributes, useId } from "react";

// assets/logo-arabic.svg: مدارس as outlined paths, so a Latin-only page never
// loads the Naskh file for the logo.
const ARABIC_VIEWBOX = "68 -677 2527 932";
const ARABIC_PATH =
  "M250 255Q163 255 116 204Q68 153 68 56Q68 38 70 18Q72 -2 78 -27Q83 -52 91 -84L133 -74Q120 -27 120 3Q120 75 154 112Q187 149 253 149Q305 149 350 138Q394 126 432 104Q469 81 497 48Q464 -20 442 -68Q419 -116 419 -138Q419 -174 440 -202Q461 -231 508 -255Q510 -242 513 -223Q516 -204 521 -176Q526 -149 532 -111Q549 -108 564 -106Q579 -105 592 -105Q615 -105 630 -107Q646 -109 669 -115Q677 -129 691 -166Q700 -193 708 -214Q716 -234 722 -250Q728 -266 738 -272Q749 -279 766 -279Q785 -279 799 -270Q792 -255 781 -222Q770 -188 756 -143Q798 -123 842 -114Q885 -104 940 -100Q931 -121 920 -144Q910 -168 898 -194Q886 -218 878 -238Q870 -257 870 -273Q870 -296 894 -323Q918 -350 953 -369Q959 -338 966 -304Q973 -270 979 -240Q986 -205 990 -179Q994 -153 994 -136Q994 -122 988 -97Q982 -72 972 -46Q963 -19 953 0Q891 0 833 -12Q775 -25 723 -48L713 -28Q706 -16 669 -8Q650 -4 628 -2Q606 0 580 0Q572 0 564 -0Q555 -1 546 -2V10Q546 75 506 132Q467 189 398 222Q364 239 327 247Q290 255 250 255Z M1150 198Q1137 198 1115 188Q1093 179 1066 162Q1040 145 1016 125L1031 86Q1058 93 1083 96Q1108 99 1130 99Q1204 99 1256 60Q1308 20 1332 -55Q1325 -70 1317 -86Q1309 -101 1299 -117Q1269 -167 1248 -206Q1227 -246 1227 -276Q1227 -304 1248 -328Q1268 -352 1302 -369Q1307 -350 1316 -324Q1324 -297 1334 -271Q1343 -245 1350 -224Q1363 -188 1372 -152Q1380 -117 1380 -86Q1380 -8 1350 58Q1320 123 1268 161Q1215 198 1150 198Z M1540 -6Q1537 -104 1532 -182Q1528 -261 1524 -329Q1519 -397 1514 -460Q1509 -523 1502 -591Q1499 -616 1510 -635Q1522 -654 1544 -664Q1567 -675 1595 -677Q1602 -650 1612 -618Q1622 -587 1634 -555L1602 -530Q1605 -469 1606 -392Q1606 -315 1604 -221Q1603 -127 1598 -14Z M1858 0Q1728 0 1728 -73Q1728 -93 1735 -113Q1742 -133 1754 -145Q1779 -125 1811 -115Q1843 -105 1890 -105Q1920 -105 1952 -109Q1983 -113 2016 -121Q1990 -166 1970 -210Q1951 -254 1940 -290Q1929 -326 1929 -345Q1929 -377 1945 -400Q1961 -423 1993 -433Q2014 -350 2036 -285Q2057 -220 2084 -173Q2103 -138 2126 -124Q2148 -110 2184 -110Q2192 -110 2192 -102V-14Q2192 -6 2184 -6Q2147 -6 2118 -18Q2088 -30 2065 -54Q1961 0 1858 0Z M2539 0Q2496 0 2451 -7Q2406 -14 2365 -28Q2324 -41 2293 -57Q2269 -30 2242 -18Q2214 -6 2175 -6Q2167 -6 2167 -14V-102Q2167 -110 2175 -110Q2215 -110 2244 -128Q2273 -147 2292 -184Q2306 -211 2316 -231Q2327 -251 2336 -266Q2345 -282 2354 -295Q2379 -328 2402 -342Q2426 -357 2455 -357Q2489 -357 2522 -320Q2554 -283 2575 -223Q2595 -165 2595 -110Q2595 -82 2580 -51Q2564 -20 2539 0ZM2510 -99Q2507 -139 2494 -174Q2482 -210 2467 -231Q2452 -249 2440 -249Q2413 -249 2391 -222Q2383 -212 2371 -192Q2359 -172 2344 -142Q2377 -126 2418 -115Q2459 -104 2510 -99Z";

// The subtitle an app gets when the caller passes none. The landing page has none.
const appNames = {
  tedris: "Tedris",
  nizam: "Nizam",
  nazir: "Nazır",
  giris: "Giriş",
} as const;

export interface LogoProps extends HTMLAttributes<HTMLSpanElement> {
  /** the app whose name is the default subtitle; the mark is the same in every app */
  app?: "tedris" | "nizam" | "nazir" | "landing" | "giris";
  /** mark 24 / 32 / 48; sm drops the inner rule; lg with the wordmark adds مدارس under it */
  size?: "sm" | "md" | "lg";
  /** "Medaris" beside the mark, in Literata semibold */
  wordmark?: boolean;
  /** under the wordmark and in the accessible name; defaults to the app's display name, except at lg */
  subtitle?: string;
  /** the مدارس lockup under the wordmark: on at lg, off when the page has its own title (the sign-in card) */
  arabic?: boolean;
}

/**
 * The Medaris mark: a lâciverd ground and a pale lâciverd arch, the same in
 * both themes. At lg the wordmark lockup adds مدارس. Port of
 * design-system/medaris-unified/components/Logo.jsx; its geometry is
 * libs/icons MadrasahLogoIcon and is never redrawn.
 */
export function Logo({
  app,
  size = "md",
  wordmark = false,
  subtitle = size === "lg" || app === undefined || app === "landing"
    ? undefined
    : appNames[app],
  arabic = size === "lg",
  className,
  ...rest
}: LogoProps) {
  const filter = `mds-logo-arch-${useId().replace(/[^\w-]/g, "")}`;
  const cls = ["mds-logo", size !== "md" && `mds-logo--${size}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <span
      className={cls}
      role="img"
      aria-label={subtitle ? `Medaris — ${subtitle}` : "Medaris"}
      {...rest}
    >
      <svg
        className="mds-logo__mark"
        viewBox="0 0 48 48"
        aria-hidden="true"
        focusable="false"
      >
        <rect className="mds-logo__ground" width="48" height="48" rx="12" />
        <g className="mds-logo__arch" filter={`url(#${filter})`}>
          <path d="M14.4327 24.2434V38.1C14.4327 38.9284 15.1042 39.6 15.9327 39.6H23.7173V8.4C15.0737 9.68201 14.9368 16.815 16.0327 20.4C14.0326 21.2 14.4327 23.2 14.4327 24.2434Z" />
          <path d="M33.3172 24.2434V38.1C33.3172 38.9284 32.6456 39.6 31.8172 39.6H24.0325V8.4C32.6762 9.68201 32.8131 16.815 31.7172 20.4C33.7172 21.2 33.3172 23.2 33.3172 24.2434Z" />
        </g>
        <defs>
          <filter
            id={filter}
            x="14.4"
            y="8.4"
            width="18.9498"
            height="31.2"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend
              mode="normal"
              in="SourceGraphic"
              in2="BackgroundImageFix"
              result="shape"
            />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feOffset />
            <feGaussianBlur stdDeviation="0.375" />
            <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.3 0"
            />
            <feBlend mode="normal" in2="shape" result="innerShadow" />
          </filter>
        </defs>
      </svg>
      {wordmark && (
        <span className="mds-logo__text">
          <span className="mds-logo__word" lang="en" dir="ltr">
            Medaris
          </span>
          {size === "lg" && arabic && (
            <svg
              className="mds-logo__arabic"
              viewBox={ARABIC_VIEWBOX}
              aria-hidden="true"
              focusable="false"
            >
              <path d={ARABIC_PATH} />
            </svg>
          )}
          {subtitle && (
            <span className="mds-logo__subtitle" dir="auto">
              {subtitle}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
