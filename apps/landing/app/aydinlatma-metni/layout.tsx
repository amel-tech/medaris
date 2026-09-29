import { Inter, Playfair_Display } from "next/font/google";
import type { ReactNode } from "react";
import "@medaris/ui/globals.css";
import "../globals.css";

// The same faces as `[locale]/layout.tsx`'s left-to-right pages.
const inter = Inter({ subsets: ["latin"] });

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

/**
 * The privacy notice sits outside `[locale]` (MDRS-102): its address must not
 * change with the visitor's language, and it is Turkish for everyone. The
 * middleware's matcher leaves the path alone, so next-intl never prefixes it.
 */
export default function PrivacyNoticeLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="tr" dir="ltr">
      <body
        className={`${inter.className} ${playfairDisplay.variable} bg-white text-gray-800`}
      >
        {children}
      </body>
    </html>
  );
}
