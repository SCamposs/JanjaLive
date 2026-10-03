import type { Metadata, Viewport } from "next";
import { Special_Elite } from "next/font/google";
import type { ReactNode } from "react";
import { WebAnalytics } from "@/components/web-analytics";
import "./globals.css";

const specialElite = Special_Elite({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-special-elite",
  weight: "400",
});

export const metadata: Metadata = {
  title: { default: "JanjaLive", template: "%s · JanjaLive" },
  description: "Compartilhamento privado de tela entre amigos.",
  manifest: "/manifest.webmanifest",
  applicationName: "JanjaLive",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#050505", colorScheme: "dark" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={specialElite.variable} lang="pt-BR">
      <body>{children}<WebAnalytics /></body>
    </html>
  );
}
