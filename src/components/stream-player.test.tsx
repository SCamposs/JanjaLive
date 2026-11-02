// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamPlayer } from "./stream-player";

describe("StreamPlayer controls", () => {
  it("keeps two streams independent and starts the additional stream muted", () => {
    const stopFirst = vi.fn();
    const stopSecond = vi.fn();
    const { container } = render(<>
      <StreamPlayer stream={{} as MediaStream} streamerName="Primeira" status="good" onStop={stopFirst} />
      <StreamPlayer stream={{} as MediaStream} streamerName="Segunda" status="good" onStop={stopSecond} initiallyMuted />
    </>);
    const videos = container.querySelectorAll("video");
    expect(videos[0].muted).toBe(false);
    expect(videos[1].muted).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Ativar som" }));
    expect(videos[1].muted).toBe(false);
    fireEvent.click(screen.getAllByRole("button", { name: "Parar de assistir" })[1]);
    expect(stopSecond).toHaveBeenCalledOnce();
    expect(stopFirst).not.toHaveBeenCalled();
  });
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

  it("shows hidden controls again when the viewer touches the player", () => {
    const { container } = render(
      <StreamPlayer
        stream={{} as MediaStream}
        streamerName="Amigo"
        status="good"
        onStop={vi.fn()}
      />,
    );
    const player = container.querySelector(".player-shell");

    act(() => vi.advanceTimersByTime(2_500));
    expect(player?.getAttribute("data-controls-visible")).toBe("false");

    fireEvent.touchStart(player!);

    expect(player?.getAttribute("data-controls-visible")).toBe("true");
  });
});
