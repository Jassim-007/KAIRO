
import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Caveat, Figtree } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import AppShell from "@/app/components/app-shell";

const body = Figtree({
  variable: "--f-body",
  subsets: ["latin"],
  display: "swap",
});

const display = Bricolage_Grotesque({
  variable: "--f-display",
  subsets: ["latin"],
  display: "swap",
});

const hand = Caveat({
  variable: "--f-hand",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "KAIRO — Fitness & Wellness",
    template: "%s | KAIRO",
  },
  description:
    "Your moment. Your momentum. Track workouts, nutrition, hydration, and progress.",
  applicationName: "KAIRO",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      {
        url: "/kairo-k-symbol.svg",
        type: "image/svg+xml",
      },
      {
        url: "/kairo-icon-192.png",
        type: "image/png",
        sizes: "192x192",
      },
    ],
    apple: [
      {
        url: "/kairo-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "KAIRO",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f0" },
    { media: "(prefers-color-scheme: dark)", color: "#111329" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${body.variable} ${display.variable} ${hand.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <AppShell>{children}</AppShell>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
