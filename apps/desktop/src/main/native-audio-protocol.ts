export const NATIVE_AUDIO_PROTOCOL_VERSION = 1;
export const NATIVE_AUDIO_MAX_PAYLOAD_BYTES = 1024 * 1024;

const HEADER_BYTES = 12;
const MAGIC = Buffer.from("JNJA", "ascii");

export type NativeAudioFrame =
  | { type: "format"; sampleRate: number; channels: number; bitsPerSample: 16 }
  | { type: "pcm"; payload: Buffer };

export class NativeAudioProtocolParser {
  private pending: Buffer<ArrayBufferLike> = Buffer.alloc(0);

  push(chunk: Buffer): NativeAudioFrame[] {
    if (chunk.length === 0) return [];
    this.pending = this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk]);
    const frames: NativeAudioFrame[] = [];

    while (this.pending.length >= HEADER_BYTES) {
      if (!this.pending.subarray(0, 4).equals(MAGIC)) throw new Error("NATIVE_AUDIO_INVALID_MAGIC");
      const version = this.pending.readUInt16LE(4);
      if (version !== NATIVE_AUDIO_PROTOCOL_VERSION) throw new Error("NATIVE_AUDIO_UNSUPPORTED_PROTOCOL");
      const frameType = this.pending.readUInt16LE(6);
      const payloadBytes = this.pending.readUInt32LE(8);
      if (payloadBytes > NATIVE_AUDIO_MAX_PAYLOAD_BYTES) throw new Error("NATIVE_AUDIO_OVERSIZED_FRAME");
      if (this.pending.length < HEADER_BYTES + payloadBytes) break;

      const payload = Buffer.from(this.pending.subarray(HEADER_BYTES, HEADER_BYTES + payloadBytes));
      this.pending = this.pending.subarray(HEADER_BYTES + payloadBytes);
      if (frameType === 1) {
        if (payload.length !== 8) throw new Error("NATIVE_AUDIO_INVALID_FORMAT");
        const sampleRate = payload.readUInt32LE(0);
        const channels = payload.readUInt16LE(4);
        const bitsPerSample = payload.readUInt16LE(6);
        if (sampleRate < 8_000 || sampleRate > 192_000 || channels < 1 || channels > 8 || bitsPerSample !== 16) {
          throw new Error("NATIVE_AUDIO_INVALID_FORMAT");
        }
        frames.push({ type: "format", sampleRate, channels, bitsPerSample: 16 });
      } else if (frameType === 2) {
        if (payload.length === 0 || payload.length % 2 !== 0) throw new Error("NATIVE_AUDIO_INVALID_PCM");
        frames.push({ type: "pcm", payload });
      } else {
        throw new Error("NATIVE_AUDIO_UNKNOWN_FRAME");
      }
    }

    return frames;
  }
}

export function parseWindowHandle(sourceId: string): string | null {
  const match = /^window:(\d+):[01]$/.exec(sourceId);
  if (!match) return null;
  try {
    const value = BigInt(match[1]!);
    return value > BigInt(0) && value <= BigInt("18446744073709551615") ? value.toString(10) : null;
  } catch {
    return null;
  }
}
