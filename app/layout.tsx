import type { Metadata, Viewport } from "next";
import { Funnel_Display, Funnel_Sans, Martian_Mono } from "next/font/google";
import { SITE, TIEHERE } from "@/content/site";
import "./globals.css";

const display = Funnel_Display({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const sans = Funnel_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = Martian_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap", axes: ["wdth"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: "AshiruLabs | Software products, built step by step",
  description: SITE.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: "AshiruLabs | Every step, shipped.",
    description: SITE.description,
    url: "/",
    siteName: "AshiruLabs",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "AshiruLabs | Every step, shipped.", description: SITE.description },
};

export const viewport: Viewport = {
  themeColor: "#0d1b2a",
  colorScheme: "dark",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE.name,
  url: SITE.url,
  email: SITE.email,
  address: { "@type": "PostalAddress", addressCountry: "LK" },
  owns: { "@type": "SoftwareApplication", name: "TieHere", url: TIEHERE.url },
};

/**
 * Every load opens on the keyboard intro. Set before first paint so the site never flashes
 * underneath, and scroll is reset so a refresh always starts at the foot of the climb.
 * Without scripts the class is never set and the intro stays hidden.
 */
const INTRO_GATE = `(function(){try{history.scrollRestoration="manual"}catch(e){}window.scrollTo(0,0);document.documentElement.classList.add("intro-active")})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INTRO_GATE }} />
      </head>
      <body>
        {children}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </body>
    </html>
  );
}
