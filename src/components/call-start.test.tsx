// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("@/app/discord/actions", () => ({ startCallAction: mocks.start }));
import { CallStart } from "./call-start";
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it("disables submission while preparing and offers explicit app/browser continuation", async () => {
  let finish!: (value: { publicId: string; desktopLink: string; cardPublished: boolean }) => void;
  mocks.start.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  render(<CallStart intentId={"a".repeat(32)} />);
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  expect((await screen.findByRole("button", { name: "Preparando sala…" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Preparando sala…" }));
  expect(mocks.start).toHaveBeenCalledTimes(1);
  await act(async () => finish({ publicId: "room-public", desktopLink: "janjalive://room/safe-token", cardPublished: true }));
  expect(screen.getByRole("link", { name: "Abrir no aplicativo" }).getAttribute("href")).toBe("janjalive://room/safe-token");
  expect(screen.getByRole("link", { name: "Continuar no navegador" }).getAttribute("href")).toBe("/join/room-public");
  expect(screen.getByRole("link", { name: "Baixar pela Microsoft Store" }).getAttribute("href")).toContain("apps.microsoft.com/detail/9NHM2B9TCL8Z");
  expect(screen.queryByRole("status")).toBeNull();
});

it("does not call an uncertain publication a failure or offer a duplicate-publication retry", async () => {
  mocks.start.mockResolvedValue({ publicId: "room-public", desktopLink: "janjalive://room/safe-token", cardStatus: "pending", cardPublished: false });
  render(<CallStart intentId={"a".repeat(32)} />);
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  expect((await screen.findByRole("status")).textContent).toContain("ainda não foi confirmada");
  expect(screen.getByRole("button", { name: "Verificar convite" })).toBeDefined();
  expect(screen.queryByRole("button", { name: "Tentar publicar o convite" })).toBeNull();
  expect(screen.getByRole("link", { name: "Baixar pela Microsoft Store" })).toBeDefined();
});
