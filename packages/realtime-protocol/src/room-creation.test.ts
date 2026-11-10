import { describe, expect, it } from "vitest";
import { roomCreationErrorMessage } from "./room-creation";

describe("room creation feedback across web and desktop", () => {
  it("distinguishes capacity from the daily budget and survives Electron IPC wrapping", () => {
    expect(roomCreationErrorMessage("ACTIVE_ROOM_LIMIT_REACHED")).toContain("5 salas ativas");
    expect(roomCreationErrorMessage(new Error("Error invoking remote method 'rooms:create': Error: DAILY_ROOM_LIMIT_REACHED")))
      .toContain("Excluir salas não libera esse limite");
  });

  it("does not blame limits or expose internal errors on an unrelated failure", () => {
    expect(roomCreationErrorMessage(new Error("database connection secret")))
      .toBe("Não foi possível criar a sala. Tente novamente.");
    expect(roomCreationErrorMessage("ROOM_CREATION_PAUSED")).toContain("temporariamente indisponível");
  });
});
