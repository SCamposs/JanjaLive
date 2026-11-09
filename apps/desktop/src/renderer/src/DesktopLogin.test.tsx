// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DesktopLogin } from "./DesktopLogin";

afterEach(cleanup);
describe("desktop session preparation", () => {
  it("shows preparation instead of flashing a login button during verification", () => {
    const { rerender } = render(<DesktopLogin auth={{ state: "checking" }} />);
    expect(screen.getByRole("status").textContent).toBe("Preparando sua sessão…");
    expect(screen.queryByRole("button", { name: "Entrar com Discord" })).toBeNull();
    rerender(<DesktopLogin auth={{ state: "signed-out" }} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Entrar com Discord" })).toBeTruthy();
  });
});
