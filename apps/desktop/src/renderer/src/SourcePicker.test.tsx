// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourcePicker } from "./SourcePicker";
import type { CaptureSource } from "../../shared/contracts";

const game: CaptureSource = { token: "game", name: "VALORANT", kind: "window", thumbnailDataUrl: "", minimized: true };
const monitor: CaptureSource = { token: "monitor", name: "Tela cheia", kind: "screen", thumbnailDataUrl: "" };
const props = () => ({ sources: { windows: [game], screens: [monitor] }, audioEnabled: false, onAudioEnabled: vi.fn(), excludedAudioSource: null, onExcludedAudioSource: vi.fn(), onSelect: vi.fn(async () => {}), onClose: vi.fn(), selecting: null });
afterEach(cleanup);
describe("source picker", () => {
  it("filters applications without hiding available monitors", () => {
    render(<SourcePicker {...props()} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "missing" } });
    expect(screen.queryByRole("button", { name: /VALORANT/ })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Nenhuma aplicação");
    expect(screen.getByRole("button", { name: "Tela cheia" })).toBeTruthy();
  });
  it("keeps application and monitor choices and displays minimized applications without a broken image", () => {
    const input = props(); render(<SourcePicker {...input} />);
    expect(screen.getByRole("heading", { name: "Aplicações" }).isConnected).toBe(true);
    expect(screen.getByRole("heading", { name: "Telas" }).isConnected).toBe(true);
    expect(screen.getByText("Minimizada").isConnected).toBe(true);
    expect(document.querySelector('img[src=""]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tela cheia" }));
    expect(input.onSelect).toHaveBeenCalledWith(monitor);
  });
  it("disables new selections while preparing but keeps cancellation available", () => {
    const input = props(); render(<SourcePicker {...input} selecting={game} />);
    expect(screen.getByRole("status").textContent).toContain("Restaurando VALORANT");
    expect(screen.getByRole("button", { name: /VALORANT/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Tela cheia" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar seleção" }));
    expect(input.onClose).toHaveBeenCalledOnce();
  });
  it("allows Escape to close or cancel the dialog", () => {
    const input = props(); render(<SourcePicker {...input} selecting={game} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(input.onClose).toHaveBeenCalledOnce();
  });
});
