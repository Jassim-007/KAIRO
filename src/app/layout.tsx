import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Caveat, Figtree } from "next/font/google";
import "./globals.css";
import AppShell from "@/app/components/app-shell";

const body = Figtree({ variable: "--f-body", subsets: ["latin"], display: "swap" });
const display = Bricolage_Grotesque({ variable: "--f-display", subsets: ["latin"], display: "swap" });
const hand = Caveat({ variable: "--f-hand", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "FORM/AI · Fitness tracker",
  description: "Track meals, hydration, weight, and workouts with an AI-first fitness log.",
  appleWebApp: { capable: true, title: "FORM/AI", statusBarStyle: "default" },
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
    <html lang="en" className={`${body.variable} ${display.variable} ${hand.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
