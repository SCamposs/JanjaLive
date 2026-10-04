import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Special_Elite } from "next/font/google";
import type { ReactNode } from "react";
import { WebAnalytics } from "@/components/web-analytics";
import "./globals.css";

const specialElite = Special_Elite({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-special-elite",
  weight: "400",
});

const ibmPlexMono = IBM_Plex_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-interface",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "JanjaLive", template: "%s · JanjaLive" },
  description: "Compartilhamento privado de tela entre amigos.",
  manifest: "/manifest.json",
  applicationName: "JanjaLive",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#050505", colorScheme: "dark" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={`${ibmPlexMono.variable} ${specialElite.variable}`} lang="pt-BR">
      <body>{children}<WebAnalytics /></body>
    </html>
  );
}
