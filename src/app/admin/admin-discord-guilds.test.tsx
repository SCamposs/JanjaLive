// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminDiscordGuilds } from "./admin-discord-guilds";
const initial = { guilds: [{ id: "100000000000000080", name: "Meu servidor", blocked: false, syncPending: false }], page: 1, total: 1, totalPages: 1 };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("requires confirmation, prevents duplicate mutations while pending and shows the new block state", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })); vi.stubGlobal("fetch", fetcher);
  render(<AdminDiscordGuilds initialData={initial} />);
  fireEvent.click(screen.getByRole("button", { name: "Bloquear Meu servidor" }));
  expect(await screen.findByRole("dialog")).toBeDefined();
  expect(fetcher).not.toHaveBeenCalled();
  const confirm = screen.getByRole("button", { name: "Bloquear servidor" });
  fireEvent.click(confirm); fireEvent.click(confirm);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect((screen.getByRole("button", { name: "Bloqueando…" }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => finish(Response.json({ blocked: true, syncPending: false })));
  expect(await screen.findByRole("button", { name: "Desbloquear Meu servidor" })).toBeDefined();
  expect(screen.getByText("Bloqueado", { exact: true })).toBeDefined();
});
it("allows an explicit retry when the block is saved but provider delivery is pending", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ error: "DISCORD_GUILD_SYNC_PENDING" }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ blocked: true, syncPending: false })); vi.stubGlobal("fetch", fetcher);
  render(<AdminDiscordGuilds initialData={initial} />);
  fireEvent.click(screen.getByRole("button", { name: "Bloquear Meu servidor" }));
  fireEvent.click(await screen.findByRole("button", { name: "Bloquear servidor" }));
  fireEvent.click(await screen.findByRole("button", { name: "Concluir alteração" }));
  expect(await screen.findByText("Bloqueado", { exact: true })).toBeDefined();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ blocked: true });
});
it("searches with bounded pagination and keeps the empty state useful", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ ...initial, guilds: [], total: 0 })); vi.stubGlobal("fetch", fetcher);
  render(<AdminDiscordGuilds initialData={initial} />);
  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar servidores" }), { target: { value: "Outro" } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
  expect(await screen.findByText("Nenhum servidor encontrado.")).toBeDefined();
  expect(fetcher.mock.calls[0][0]).toContain("q=Outro&page=1");
});
