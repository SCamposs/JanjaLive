import type { WebContents } from "electron";

export function bindCaptureOwner(contents: Pick<WebContents, "on" | "once">, release: () => void) {
  contents.once("destroyed", release);
  contents.on("render-process-gone", release);
  contents.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument) release();
  });
}
