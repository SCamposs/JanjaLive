// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { DesktopNoirBackdrop } from "./DesktopNoirBackdrop";

afterEach(cleanup);

it("shows no broken images or glitch layers after an image failure", () => {
  const { container } = render(<DesktopNoirBackdrop />);
  expect(container.firstElementChild?.getAttribute("data-image-state")).toBe("loading");
  fireEvent.error(container.querySelector("img")!);
  expect(container.firstElementChild?.getAttribute("data-image-state")).toBe("failed");
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector(".desktop-noir-scan")).toBeNull();
});

it("preserves the loaded effect and resets the fallback for a different source", () => {
  const view = render(<DesktopNoirBackdrop image="/first.webp" />);
  fireEvent.load(view.container.querySelector("img")!);
  expect(view.container.querySelectorAll("img")).toHaveLength(3);
  view.rerender(<DesktopNoirBackdrop image="/second.webp" />);
  expect(view.container.firstElementChild?.getAttribute("data-image-state")).toBe("loading");
  expect(view.container.querySelectorAll("img")).toHaveLength(1);
});
