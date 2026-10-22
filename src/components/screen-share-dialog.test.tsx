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
});
