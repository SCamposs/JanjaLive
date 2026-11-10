// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateRoomForm } from "./create-room-form";

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

describe("CreateRoomForm room code", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    routerPush.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each([
    ["ACTIVE_ROOM_LIMIT_REACHED", "5 salas ativas"],
    ["DAILY_ROOM_LIMIT_REACHED", "20 criações em 24 horas"],
  ])("explains %s without navigating away", async (error, message) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error }), { status: 429 }));
    render(<CreateRoomForm />);
    fireEvent.click(screen.getByRole("button", { name: "Criar sala" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(message));
    expect((screen.getByRole("button", { name: "Criar sala" }) as HTMLButtonElement).disabled).toBe(false);
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("submits automatically when all seven valid characters are present", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ joinPath: "/join/example" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    render(<CreateRoomForm />);

    fireEvent.change(screen.getByLabelText("Código da sala, 7 caracteres"), {
      target: { value: "fh2abcd" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ code: "FH2ABCD" });
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/join/example"));
  });

  it("ignores ambiguous characters instead of submitting an invalid code", () => {
    render(<CreateRoomForm />);

    const input = screen.getByLabelText("Código da sala, 7 caracteres") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "I0O1-FH2" } });

    expect(input.value).toBe("FH2");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
