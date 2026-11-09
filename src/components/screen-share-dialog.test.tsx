// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScreenShareDialog } from "./screen-share-dialog";

describe("ScreenShareDialog", () => {
  afterEach(cleanup);

  it("configures quality before asking the browser for a source", async () => {
    const onStart = vi.fn().mockResolvedValue(true);
    render(<ScreenShareDialog open onCancel={vi.fn()} onStart={onStart} />);

    expect(screen.getByText("O navegador pedirá uma aba, janela ou tela.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /escolher e transmitir/i }));

    expect(onStart).toHaveBeenCalledWith({
      preset: "1080p60",
      bitrate: 10_000_000,
      frameRate: 60,
    });
  });
  it("exposes the selected quality options through radio semantics", () => {
    render(<ScreenShareDialog open onCancel={vi.fn()} onStart={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "1080p", checked: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "720p" }));
    expect(screen.getByRole("radio", { name: "720p", checked: true })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Resolução" })).toBeTruthy();
  });
});
