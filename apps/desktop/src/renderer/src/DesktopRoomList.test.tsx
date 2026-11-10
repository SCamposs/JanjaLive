// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopRoomList } from "./DesktopRoomList";
const room = { id: "room-id", name: "Amigos", publicId: "public-id", expiresAt: "2026-12-01T00:00:00Z", expiresInMs: 86_400_000 };
const leave = vi.fn(); const remove = vi.fn(); const refresh = vi.fn(); const open = vi.fn();
beforeEach(() => { vi.resetAllMocks(); leave.mockResolvedValue(undefined); remove.mockResolvedValue(undefined); refresh.mockResolvedValue(undefined); vi.stubGlobal("janja", { rooms: { leave, delete: remove } }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("desktop room removal", () => {
  it("reports a failed room open and allows another attempt", async () => {
    open.mockRejectedValueOnce(new Error("offline"));
    render(<DesktopRoomList rooms={[{ ...room, role: "OWNER" }]} onOpen={open} onRefresh={refresh} />);
    fireEvent.click(screen.getByRole("button", { name: /^Amigos/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível abrir");
    expect((screen.getByRole("button", { name: /^Amigos/ }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("only revokes a member's own access after explicit confirmation", async () => {
    render(<DesktopRoomList rooms={[{ ...room, role: "MEMBER" }]} onOpen={open} onRefresh={refresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover Amigos da minha lista" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(leave).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remover da lista" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(leave).toHaveBeenCalledWith("room-id"); expect(remove).not.toHaveBeenCalled();
  });
  it("deletes an owned room through the existing owner endpoint", async () => {
    render(<DesktopRoomList rooms={[{ ...room, role: "OWNER" }]} onOpen={open} onRefresh={refresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir Amigos" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir sala" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(remove).toHaveBeenCalledWith("room-id"); expect(leave).not.toHaveBeenCalled();
  });
  it("cancels without changing the membership or opening the room", async () => {
    render(<DesktopRoomList rooms={[{ ...room, role: "MEMBER" }]} onOpen={open} onRefresh={refresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover Amigos da minha lista" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar" }));
    expect(leave).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
  });
});
