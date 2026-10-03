import { describe, expect, it } from "vitest";
import { getProtocolRegistration } from "./protocol-registration";

describe("getProtocolRegistration", () => {
  it("never lets the packaged smoke test replace the installed protocol handler", () => {
    expect(getProtocolRegistration({
      isPackagedSmokeTest: true,
      isDefaultApp: false,
      executable: "C:\\repo\\dist\\win-unpacked\\JanjaLive.exe",
    })).toBeNull();
  });

  it("registers a packaged build with its exact executable", () => {
    expect(getProtocolRegistration({
      isPackagedSmokeTest: false,
      isDefaultApp: false,
      executable: "C:\\Users\\person\\AppData\\Local\\Programs\\JanjaLive\\JanjaLive.exe",
    })).toEqual({
      executable: "C:\\Users\\person\\AppData\\Local\\Programs\\JanjaLive\\JanjaLive.exe",
      args: [],
    });
  });
});
