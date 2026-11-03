// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { AccessGate } from "./access-gate";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("offers another request after a pending request is rejected", () => {
  const props = { roomId: "room", roomName: "Room" };
  const view = render(<AccessGate {...props} state="pending" />);
  view.rerender(<AccessGate {...props} state="rejected" />);
  expect(screen.queryByText("Aguardando aprovação")).toBeNull();
  expect(screen.getByRole("button", { name: "Solicitar acesso" })).toBeTruthy();
});
it("recovers from a network error instead of keeping the request disabled", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<AccessGate roomId="room" roomName="Room" state="invited" />);
  fireEvent.click(screen.getByRole("button", { name: "Solicitar acesso" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Não foi possível"));
  expect((screen.getByRole("button", { name: "Solicitar acesso" }) as HTMLButtonElement).disabled).toBe(false);
});
