// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamPlayer } from "./stream-player";

describe("StreamPlayer controls", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("hides after inactivity and returns immediately with pointer movement", () => {
    const { container } = render(
      <StreamPlayer
        stream={{} as MediaStream}
        streamerName="Amigo"
        status="good"
        onStop={vi.fn()}
      />,
    );
    const player = container.querySelector(".player-shell");

    expect(player?.getAttribute("data-controls-visible")).toBe("true");

    act(() => vi.advanceTimersByTime(2_500));
    expect(player?.getAttribute("data-controls-visible")).toBe("false");

    fireEvent.pointerMove(player!, { pointerType: "mouse" });
    expect(player?.getAttribute("data-controls-visible")).toBe("true");
  });

  it("keeps controls visible while a control has keyboard focus", () => {
    const { container } = render(
      <StreamPlayer
        stream={{} as MediaStream}
        streamerName="Amigo"
        status="good"
        onStop={vi.fn()}
      />,
    );

    fireEvent.focus(screen.getByRole("button", { name: "Silenciar" }));
    act(() => vi.advanceTimersByTime(5_000));

    expect(container.querySelector(".player-shell")?.getAttribute("data-controls-visible")).toBe("true");
  });

  it("keeps touch controls interactive and runs their action", () => {
    const onStop = vi.fn();
    const { container } = render(
      <StreamPlayer
        stream={{} as MediaStream}
        streamerName="Amigo"
        status="good"
        onStop={onStop}
      />,
    );
    const stopButton = screen.getByRole("button", { name: "Parar de assistir" });

    fireEvent.pointerDown(stopButton, { pointerType: "touch" });
    fireEvent.click(stopButton);

    expect(container.querySelector(".player-shell")?.getAttribute("data-controls-visible")).toBe("true");
    expect(onStop).toHaveBeenCalledOnce();
  });
});
