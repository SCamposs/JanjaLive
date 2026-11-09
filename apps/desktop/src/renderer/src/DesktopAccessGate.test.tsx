// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { RoomSnapshot } from "../../shared/contracts";
import { DesktopAccessGate } from "./DesktopAccessGate";
afterEach(cleanup);
it("lets a rejected user retry and recovers if the request fails", async () => {
  const room = { room: { publicId: "room-public", name: "Room" }, access: "rejected" } as RoomSnapshot;
  const onRequest = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  render(<DesktopAccessGate room={room} onUpdate={vi.fn()} onRequest={onRequest} />);
  fireEvent.click(screen.getByRole("button", { name: "Solicitar acesso" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect((screen.getByRole("button", { name: "Solicitar acesso" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Solicitar acesso" }));
  await waitFor(() => expect(onRequest).toHaveBeenCalledTimes(2));
});
