import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const desktop = createRequire(resolve("apps/desktop/package.json"));
const builder = createRequire(desktop.resolve("electron-builder"));
const appBuilder = createRequire(builder.resolve("app-builder-lib"));
const universal = createRequire(appBuilder.resolve("@electron/universal"));
type Matcher = { set: unknown[]; match: (path: string) => boolean; secondPhasePreProcess: (parts: string[][]) => string[][]; partsMatch: (...args: unknown[]) => unknown };
type MatcherModule = { Minimatch: new (pattern: string, options: { optimizationLevel: number; braceExpandMax?: number; windowsPathsNoEscape?: boolean }) => Matcher };

describe("upstream minimatch preprocessing backport", () => {
  for (const version of ["9.0.9", "10.2.6"]) {
    const entry = (version === "9.0.9" ? universal : appBuilder).resolve("minimatch");
    if (require(resolve(dirname(entry), "../../package.json")).version !== version) throw new Error(`Recheck the dependency backport for minimatch ${version}`);
    it.each(["commonjs", "esm"])(`bounds amplification and preserves matching on ${version}/%s`, async (format) => {
      const matcherModule = (format === "commonjs" ? require(entry) : await import(pathToFileURL(resolve(dirname(entry), "../esm/index.js")).href)) as MatcherModule;
      expect(() => new matcherModule.Minimatch(Array(30).fill("**/../a/b").join("/"), { optimizationLevel: 2, braceExpandMax: 64 })).toThrow("minimatch pattern exceeds preprocessing limit");
      expect(() => new matcherModule.Minimatch("**/../a/b/**/../c/d", { optimizationLevel: 2, braceExpandMax: 2 })).toThrow("minimatch pattern exceeds preprocessing limit");
      const normal = new matcherModule.Minimatch("**/../a/b/**/../c/d", { optimizationLevel: 2 });
      expect(normal.set).toHaveLength(4);
      expect(normal.match("../a/b/../c/d")).toBe(true);
      expect(normal.match("x/a/b/y/c/d")).toBe(true);
      const large = Array.from({ length: 1001 }, (_, i) => [String(i)]);
      normal.partsMatch = () => { throw new Error("Quadratic pass must not run for a large set"); };
      expect(normal.secondPhasePreProcess(large)).toBe(large);
    });
  }
});
