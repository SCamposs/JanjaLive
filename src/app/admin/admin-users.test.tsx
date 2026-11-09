// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminUsers } from "./admin-users";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const initialData = { users: [], page: 1, pageSize: 25, total: 30, totalPages: 2, order: "newest" as const };

describe("admin search and ordering", () => {
  it("submits the Base UI search field and preserves the filter during pagination", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => initialData });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminUsers initialData={initialData} ownerUserId="owner" />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar usuários" }), { target: { value: "  Amigo  " } });
    fireEvent.submit(screen.getByRole("button", { name: "Buscar" }).closest("form")!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/users?q=Amigo&order=newest&page=1", { cache: "no-store" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Próxima" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/users?q=Amigo&order=newest&page=2", { cache: "no-store" }));
  });

  it("opens sorting without submitting and loads the selected order from page one", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...initialData, order: "oldest" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminUsers initialData={initialData} ownerUserId="owner" />);
    fireEvent.click(screen.getByRole("combobox", { name: "Ordenar usuários" }));
    expect(fetchMock).not.toHaveBeenCalled();
    const option = await screen.findByRole("option", { name: "Mais antigos" });
    fireEvent.pointerDown(option, { pointerType: "mouse" });
    fireEvent.click(option);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/users?q=&order=oldest&page=1", { cache: "no-store" }));
  });
});
