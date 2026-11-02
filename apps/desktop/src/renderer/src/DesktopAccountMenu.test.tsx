// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopAccountMenu } from "./DesktopAccountMenu";

afterEach(cleanup);

describe("desktop account menu", () => {
  it("dismisses with Escape and preserves the logout action", async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    render(<DesktopAccountMenu user={{ name: "Pessoa" }} canLogout onLogout={logout} onSafety={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Conta de Pessoa" });
    fireEvent.click(trigger);
    fireEvent.keyDown(await screen.findByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("false"));
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Sair da conta" }));
    expect(logout).toHaveBeenCalledOnce();
  });

  it("keeps logout blocked during sharing while allowing safety information", () => {
    const logout = vi.fn();
    const safety = vi.fn();
    render(<DesktopAccountMenu user={{ name: "Pessoa" }} canLogout={false} onLogout={logout} onSafety={safety} />);
    fireEvent.click(screen.getByRole("button", { name: "Conta de Pessoa" }));
    const item = screen.getByRole("menuitem", { name: "Sair da conta" });
    fireEvent.click(item);
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(logout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "Privacidade e denúncia" }));
    expect(safety).toHaveBeenCalledOnce();
  });
});
