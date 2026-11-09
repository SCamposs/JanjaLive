// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomList } from "./room-list";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), fetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
const baseRoom = { id: "room-id", publicId: "public-id", name: "Amigos", expiresAt: new Date("2026-12-01"), expiresInMs: 86_400_000 };
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("fetch", mocks.fetch); mocks.fetch.mockResolvedValue({ ok: true }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("room removal confirmation", () => {
  it("explains self-revocation and only removes the membership after confirmation", async () => {
    render(<RoomList rooms={[{ ...baseRoom, role: "MEMBER" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover Amigos da minha lista" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("precisará pedir aprovação novamente");
    expect(mocks.fetch).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remover da lista" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith("/api/rooms/room-id/membership", { method: "DELETE" }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("keeps owner deletion separate and explains its impact on everyone", async () => {
    render(<RoomList rooms={[{ ...baseRoom, role: "OWNER" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir Amigos" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("excluída para todos");
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir sala" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith("/api/rooms/room-id", { method: "DELETE" }));
  });
  it("allows cancellation without revoking access or deleting a room", async () => {
    render(<RoomList rooms={[{ ...baseRoom, role: "MEMBER" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover Amigos da minha lista" }));
    const dialog = await screen.findByRole("alertdialog");
    const cancel = within(dialog).getByRole("button", { name: "Cancelar" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("keeps the dialog available for retry after a server error", async () => {
    mocks.fetch.mockResolvedValue({ ok: false });
    render(<RoomList rooms={[{ ...baseRoom, role: "MEMBER" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover Amigos da minha lista" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remover da lista" }));
    expect(await within(dialog).findByRole("alert")).toBeTruthy();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("blocks duplicate confirmation and dismissal while the server is processing", async () => {
    let finish!: (value: { ok: boolean }) => void;
    mocks.fetch.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<RoomList rooms={[{ ...baseRoom, role: "MEMBER" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover Amigos da minha lista" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remover da lista" }));
    expect((within(dialog).getByRole("button", { name: "Removendo…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(mocks.fetch).toHaveBeenCalledOnce();
    finish({ ok: true });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  });
});
