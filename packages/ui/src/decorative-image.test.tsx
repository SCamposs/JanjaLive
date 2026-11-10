// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useDecorativeImageState } from "./decorative-image";

function CachedImage() {
  const { state, imageRef } = useDecorativeImageState();
  // eslint-disable-next-line @next/next/no-img-element -- Exercises a native image ref and its cached loading properties.
  return <div data-state={state}><img alt="" src="/cached.webp" ref={imageRef} /></div>;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each([[1600, "ready"], [0, "failed"]])("handles cached completion without waiting for another load event (%s)", (width, expected) => {
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(width);
  const { container } = render(<CachedImage />);
  expect(container.firstElementChild?.getAttribute("data-state")).toBe(expected);
});
