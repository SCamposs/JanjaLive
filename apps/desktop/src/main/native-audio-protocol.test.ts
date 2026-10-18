import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { NativeAudioProtocolParser, parseWindowHandle } from "./native-audio-protocol";

function frame(type: number, payload: Buffer) {
  const header = Buffer.alloc(12);
  header.write("JNJA", 0, "ascii");
  header.writeUInt16LE(1, 4);
  header.writeUInt16LE(type, 6);
  header.writeUInt32LE(payload.length, 8);
  return Buffer.concat([header, payload]);
}

describe("native audio protocol", () => {
  it("parses fragmented format and PCM frames", () => {
    const format = Buffer.alloc(8);
    format.writeUInt32LE(48_000, 0);
    format.writeUInt16LE(2, 4);
    format.writeUInt16LE(16, 6);
    const bytes = Buffer.concat([frame(1, format), frame(2, Buffer.from([1, 2, 3, 4]))]);
    const parser = new NativeAudioProtocolParser();

    expect(parser.push(bytes.subarray(0, 9))).toEqual([]);
    expect(parser.push(bytes.subarray(9))).toEqual([
      { type: "format", sampleRate: 48_000, channels: 2, bitsPerSample: 16 },
      { type: "pcm", payload: Buffer.from([1, 2, 3, 4]) },
    ]);
  });

  it("rejects unknown or oversized frames", () => {
    const parser = new NativeAudioProtocolParser();
    expect(() => parser.push(frame(9, Buffer.from([1, 2])))).toThrow("NATIVE_AUDIO_UNKNOWN_FRAME");

    const oversized = Buffer.alloc(12);
    oversized.write("JNJA", 0, "ascii");
    oversized.writeUInt16LE(1, 4);
    oversized.writeUInt16LE(2, 6);
    oversized.writeUInt32LE(1024 * 1024 + 1, 8);
    expect(() => new NativeAudioProtocolParser().push(oversized)).toThrow("NATIVE_AUDIO_OVERSIZED_FRAME");
  });
});

describe("desktop source handle parsing", () => {
  it("accepts only Electron window source IDs", () => {
    expect(parseWindowHandle("window:1324:0")).toBe("1324");
    expect(parseWindowHandle("window:42:1")).toBe("42");
    expect(parseWindowHandle("screen:0:0")).toBeNull();
    expect(parseWindowHandle("window:-1:0")).toBeNull();
    expect(parseWindowHandle("window:12:2")).toBeNull();
  });
});
