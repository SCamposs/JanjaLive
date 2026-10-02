"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

export function sanitizeAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent {
  const withoutQueryOrHash = event.url.split(/[?#]/, 1)[0];
  const redactedUrl = withoutQueryOrHash
    .replace(/\/room\/[^/]+$/, "/room/[invite]")
    .replace(/\/join\/[^/]+$/, "/join/[room]");

  return { ...event, url: redactedUrl };
}

export function WebAnalytics() {
  return <Analytics beforeSend={sanitizeAnalyticsEvent} />;
}
