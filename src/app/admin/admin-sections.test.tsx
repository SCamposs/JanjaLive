// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminSections } from "./admin-sections";
import { AdminUsers } from "./admin-users";
import { AdminDiscordGuilds } from "./admin-discord-guilds";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderAdmin() {
  return render(<AdminSections users={<AdminUsers initialData={{ users: [], page: 1, pageSize: 25, total: 0, totalPages: 1, order: "newest" }} ownerUserId="owner" />}
    guilds={<AdminDiscordGuilds initialData={{ guilds: [], page: 1, total: 0, totalPages: 1 }} />} />);
}

describe("admin section navigation", () => {
  it("switches sections without requests and retains each search field", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderAdmin();
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar usuários" }), { target: { value: "Amigo" } });
    fireEvent.click(screen.getByRole("tab", { name: "Servidores" }));
    expect(screen.queryByRole("searchbox", { name: "Buscar usuários" })).toBeNull();
    const guildSearch = within(screen.getByRole("tabpanel")).getByRole("searchbox");
    fireEvent.change(guildSearch, { target: { value: "Meu servidor" } });
    fireEvent.click(screen.getByRole("tab", { name: "Usuários" }));
    expect((screen.getByRole("searchbox", { name: "Buscar usuários" }) as HTMLInputElement).value).toBe("Amigo");
    fireEvent.click(screen.getByRole("tab", { name: "Servidores" }));
    expect((within(screen.getByRole("tabpanel")).getByRole("searchbox") as HTMLInputElement).value).toBe("Meu servidor");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("supports arrow key navigation and exposes the selected panel", async () => {
    renderAdmin();
    const users = screen.getByRole("tab", { name: "Usuários" });
    users.focus();
    fireEvent.keyDown(users, { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByRole("tab", { name: "Servidores" }).getAttribute("aria-selected")).toBe("true"));
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(screen.getByRole("tab", { name: "Servidores" }).id);
  });
});
