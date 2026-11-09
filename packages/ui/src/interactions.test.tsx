// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppSelect, InteractionProvider, TooltipButton } from "./index";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("shared Base UI interactions", () => {
  it("selects an option and leaves a disabled select unchanged", async () => {
    const change = vi.fn();
    const options = [{ value: "newest", label: "Mais recentes" }, { value: "oldest", label: "Mais antigos" }];
    const { rerender } = render(<AppSelect label="Ordenar" value="newest" onValueChange={change} options={options} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Ordenar" }));
    const option = await screen.findByRole("option", { name: "Mais antigos" });
    fireEvent.pointerDown(option, { pointerType: "mouse" });
    fireEvent.click(option);
    expect(change).toHaveBeenCalledWith("oldest");
    await waitFor(() => expect(screen.getByRole("combobox").getAttribute("aria-expanded")).toBe("false"));
    change.mockClear();
    rerender(<AppSelect label="Ordenar" value="newest" onValueChange={change} options={options} disabled />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(change).not.toHaveBeenCalled();
    expect((screen.getByRole("combobox") as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps tooltips inside the fullscreen layer and outside the clipped controls", async () => {
    const fullscreen = document.createElement("section");
    document.body.append(fullscreen);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreen });
    const { container } = render(<InteractionProvider><div style={{ overflow: "hidden" }}><TooltipButton tooltip="Tela cheia" aria-label="Tela cheia">Ícone</TooltipButton></div></InteractionProvider>, { container: fullscreen });
    fireEvent.focus(screen.getByRole("button", { name: "Tela cheia" }));
    const tooltip = await screen.findByText("Tela cheia", { selector: ".jl-tooltip" });
    expect(fullscreen.contains(tooltip)).toBe(true);
    expect(container.querySelector("[style]")?.contains(tooltip)).toBe(false);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Escape" });
    await waitFor(() => expect(document.querySelector(".jl-tooltip")).toBeNull());
    fullscreen.remove();
    Reflect.deleteProperty(document, "fullscreenElement");
  });

  it("preserves the original button and touch handlers without an extra hit target", async () => {
    const click = vi.fn();
    const pointer = vi.fn();
    render(<TooltipButton tooltip="Silenciar" aria-label="Silenciar" onClick={click} onPointerDown={pointer}>Som</TooltipButton>);
    const button = screen.getByRole("button", { name: "Silenciar" });
    await act(async () => {
      fireEvent.pointerDown(button, { pointerType: "touch" });
      fireEvent.pointerUp(button, { pointerType: "touch" });
      fireEvent.click(button);
    });
    expect(button.tagName).toBe("BUTTON");
    expect(click).toHaveBeenCalledOnce();
    expect(pointer).toHaveBeenCalledOnce();
    expect(document.querySelector(".jl-tooltip")).toBeNull();
  });
});
