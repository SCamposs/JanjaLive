/// <reference types="vite/client" />

import type { JanjaDesktopApi } from "../../shared/contracts";

declare global {
  interface Window {
    janja: JanjaDesktopApi;
  }
}

export {};
