import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

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
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
