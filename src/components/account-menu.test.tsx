// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "./account-menu";

const mocks = vi.hoisted(() => ({ signOut: vi.fn(), fetch: vi.fn() }));
vi.mock("next-auth/react", () => ({ signOut: mocks.signOut }));

describe("account session controls", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("fetch", mocks.fetch); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("requires a second explicit click before revoking every session", async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 200 }));
    render(<AccountMenu name="Pessoa" />);
    fireEvent.click(screen.getByRole("button", { name: "Conta de Pessoa" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Sair de todos os dispositivos/ }));
    expect(mocks.fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: /Confirmar saída de todos/ }));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledWith({ callbackUrl: "/" }));
    expect(mocks.fetch).toHaveBeenCalledWith("/api/account/sessions", { method: "DELETE" });
  });

  it("disables session termination while the user is sharing", () => {
    render(<AccountMenu name="Pessoa" signOutDisabled />);
    fireEvent.click(screen.getByRole("button", { name: "Conta de Pessoa" }));
    const button = screen.getByRole("menuitem", { name: /Sair de todos os dispositivos/ }) as HTMLButtonElement;
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("supports keyboard dismissal and restores focus to the profile", async () => {
    render(<AccountMenu name="Pessoa" />);
    const trigger = screen.getByRole("button", { name: "Conta de Pessoa" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const menu = await screen.findByRole("menu");
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("false"));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("clears the confirmation after an outside click closes the menu", async () => {
    render(<><AccountMenu name="Pessoa" /><button>Fora</button></>);
    const trigger = screen.getByRole("button", { name: "Conta de Pessoa" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: /Sair de todos/ }));
    fireEvent.mouseDown(screen.getByRole("button", { name: "Fora" }));
    fireEvent.click(screen.getByRole("button", { name: "Fora" }));
    await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("false"));
    fireEvent.click(trigger);
    expect(screen.getByRole("menuitem", { name: /Sair de todos/ })).toBeTruthy();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
