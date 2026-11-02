// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AudienceBadge } from "./audience-badge";

afterEach(cleanup);

describe("audience badge", () => {
  it("shows the count, opens the names on touch and updates when a viewer leaves", () => {
    const { rerender } = render(<AudienceBadge names={["Yan", "SCamposs"]} />);
    const button = screen.getByRole("button", { name: "2 espectadores" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Yan", "SCamposs"]);
    rerender(<AudienceBadge names={["Yan"]} />);
    expect(screen.getByRole("button", { name: "1 espectador" }).textContent).toBe("1");
    expect(screen.queryByText("SCamposs")).toBeNull();
    fireEvent.blur(button, { relatedTarget: document.body });
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });
});
