import type { NextConfig } from "next";
import { getRealtimeWebSocketSource } from "./src/lib/content-security-policy";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.discordapp.com" }],
  },
  async headers() {
    const isProduction = process.env.NODE_ENV === "production";
    const realtimeWebSocketSource = getRealtimeWebSocketSource(process.env.CLOUDFLARE_REALTIME_URL);

    if (process.env.VERCEL_ENV === "production" && !realtimeWebSocketSource) {
      throw new Error("CLOUDFLARE_REALTIME_URL must be a valid HTTP(S) URL in production.");
    }

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "frame-ancestors 'none'",
              "form-action 'self' https://discord.com",
              "img-src 'self' data: https://cdn.discordapp.com",
              "media-src 'self' blob:",
              [
                "connect-src 'self' https://*.upstash.io https://*.neon.tech",
                realtimeWebSocketSource,
              ]
                .filter(Boolean)
                .join(" "),
              `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
              "style-src 'self' 'unsafe-inline'",
            ].join("; "),
          },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), display-capture=(self), fullscreen=(self), picture-in-picture=(self)",
          },
          ...(isProduction
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
