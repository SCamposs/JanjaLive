// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopDeleteRoomAction } from "./DesktopDeleteRoomAction";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("room owner confirmation inside the desktop room", () => {
  it("requires the same explicit dialog confirmation before deletion", async () => {
    const remove = vi.fn().mockResolvedValue(undefined); const deleted = vi.fn();
    vi.stubGlobal("janja", { rooms: { delete: remove } });
    render(<DesktopDeleteRoomAction room={{ id: "room-id", name: "Amigos" }} onDeleted={deleted} />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir sala" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir sala" }));
    await waitFor(() => expect(deleted).toHaveBeenCalledOnce());
    expect(remove).toHaveBeenCalledWith("room-id");
  });
});
