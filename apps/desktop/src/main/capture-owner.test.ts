import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { expect, it, vi } from "vitest";
import { bindCaptureOwner } from "./capture-owner";

it("releases capture on renderer crash, real navigation and destruction", () => {
  const contents = new EventEmitter();
  const release = vi.fn();
  bindCaptureOwner(contents as unknown as WebContents, release);
  contents.emit("did-start-navigation", { isMainFrame: false, isSameDocument: false });
  contents.emit("did-start-navigation", { isMainFrame: true, isSameDocument: true });
  expect(release).not.toHaveBeenCalled();
  contents.emit("did-start-navigation", { isMainFrame: true, isSameDocument: false });
  contents.emit("render-process-gone", {}, { reason: "crashed" });
  contents.emit("destroyed");
  contents.emit("destroyed");
  expect(release).toHaveBeenCalledTimes(3);
});
