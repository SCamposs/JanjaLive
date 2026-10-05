import path from "node:path";
import { listPackage } from "@electron/asar";

const archive = path.resolve(
  process.cwd(),
  process.argv[2] ?? "dist/win-unpacked/resources/app.asar",
);
const entries = listPackage(archive, { isPack: false })
  .map((entry) => entry.replace(/^[/\\]+/, "").replaceAll("\\", "/"));
const entrySet = new Set(entries);

const requiredEntries = [
  "package.json",
  "out/main/index.js",
  "out/preload/index.cjs",
  "out/renderer/index.html",
  "node_modules/electron-updater/package.json",
  "node_modules/zod/package.json",
];
const forbiddenPatterns = [
  { label: "environment file", pattern: /(^|\/)\.env(?:\.|$)/i },
  { label: "credential or certificate file", pattern: /\.(?:pem|pfx|p12|key|crt|cer)$/i },
  { label: "source map", pattern: /\.map$/i },
  { label: "renderer-only dependency", pattern: /^node_modules\/(?:@fontsource|lucide-react|react|react-dom)(?:\/|$)/ },
];

const missing = requiredEntries.filter((entry) => !entrySet.has(entry));
const forbidden = entries.flatMap((entry) => forbiddenPatterns
  .filter(({ pattern }) => pattern.test(entry))
  .map(({ label }) => `${label}: ${entry}`));

if (missing.length > 0 || forbidden.length > 0) {
  const failures = [
    ...missing.map((entry) => `missing required entry: ${entry}`),
    ...forbidden,
  ];
  throw new Error(`Packaged ASAR verification failed:\n- ${failures.join("\n- ")}`);
}

console.log(`Verified ${entries.length} ASAR entries with no sensitive or redundant package content`);
