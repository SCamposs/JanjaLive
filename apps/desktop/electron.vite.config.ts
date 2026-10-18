import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: ["@janjalive/realtime-protocol"],
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        external: ["electron"],
        output: {
          format: "cjs",
          entryFileNames: "index.cjs",
        },
      },
    },
  },
  renderer: {
    root: resolve("src/renderer"),
    base: "./",
    publicDir: resolve("../../public"),
    plugins: [react()],
    build: {
      assetsInlineLimit: 0,
    },
  },
});
