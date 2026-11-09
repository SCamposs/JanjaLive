// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { UserAvatar } from "./user-avatar";

afterEach(cleanup);

describe("shared user avatars", () => {
  it.each([undefined, null, ""])("shows the nickname initial without an image (%s)", (image) => {
    const { container } = render(<UserAvatar name="  camposs " image={image} />);
    expect(container.querySelector(".jl-user-avatar-fallback")?.textContent).toBe("C");
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows the initial while loading and displays a successfully loaded image", () => {
    const { container } = render(<UserAvatar name="camposs" image="/avatar.png" />);
    expect(container.querySelector(".jl-user-avatar-fallback")?.textContent).toBe("C");
    const image = container.querySelector("img")!;
    fireEvent.load(image);
    expect(image.classList.contains("is-loaded")).toBe(true);
    expect(container.querySelector(".jl-user-avatar-fallback")).toBeNull();
  });

  it("restores the initial if the image fails", () => {
    const { container } = render(<UserAvatar name="  álvaro" image="/avatar.png" />);
    const image = container.querySelector("img")!;
    fireEvent.load(image);
    fireEvent.error(image);
    expect(image.classList.contains("is-loaded")).toBe(false);
    expect(container.querySelector(".jl-user-avatar-fallback")?.textContent).toBe("Á");
  });

  it("retries a new source after failure and handles removing a loaded image", () => {
    const { container, rerender } = render(<UserAvatar name="Camposs" image="/broken.png" />);
    fireEvent.error(container.querySelector("img")!);
    rerender(<UserAvatar name="Camposs" image="/updated.png" />);
    const updated = container.querySelector("img")!;
    expect(updated.getAttribute("src")).toBe("/updated.png");
    fireEvent.load(updated);
    expect(container.querySelector(".jl-user-avatar-fallback")).toBeNull();
    rerender(<UserAvatar name="Camposs" image={null} />);
    expect(container.querySelector(".jl-user-avatar-fallback")?.textContent).toBe("C");
    expect(container.querySelector("img")).toBeNull();
  });

  it.each([[" a\u0301lvaro", "Á"], ["𐐨name", "𐐀"], ["   ", "?"]])("handles the initial in %s", (name, initial) => {
    const { container } = render(<UserAvatar name={name!} />);
    expect(container.querySelector(".jl-user-avatar-fallback")?.textContent).toBe(initial);
  });
});
