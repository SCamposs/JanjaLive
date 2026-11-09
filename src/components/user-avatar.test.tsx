// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { UserAvatar } from "./user-avatar";

afterEach(cleanup);

it("uses the initial when the optimized Next image fails and retries a changed URL", async () => {
  const { container, rerender } = render(<UserAvatar name="Camposs" image="/avatar.png" />);
  const image = container.querySelector("img")!;
  expect(image.getAttribute("data-nimg")).toBe("1");
  fireEvent.error(image);
  expect(container.querySelector(".jl-user-avatar-fallback")?.textContent).toBe("C");
  rerender(<UserAvatar name="Camposs" image="/updated-avatar.png" />);
  const updated = container.querySelector("img")!;
  expect(updated.getAttribute("src")).toContain("updated-avatar.png");
  fireEvent.load(updated);
  await waitFor(() => expect(container.querySelector(".jl-user-avatar-fallback")).toBeNull());
});
