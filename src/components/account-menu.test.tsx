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
    fireEvent.click(screen.getByText("Pessoa", { selector: "summary span" }));
    fireEvent.click(screen.getByRole("button", { name: /Sair de todos os dispositivos/ }));
    expect(mocks.fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Confirmar saída de todos/ }));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledWith({ callbackUrl: "/" }));
    expect(mocks.fetch).toHaveBeenCalledWith("/api/account/sessions", { method: "DELETE" });
  });

  it("disables session termination while the user is sharing", () => {
    render(<AccountMenu name="Pessoa" signOutDisabled />);
    fireEvent.click(screen.getByText("Pessoa", { selector: "summary span" }));
    const button = screen.getByRole("button", { name: /Sair de todos os dispositivos/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
