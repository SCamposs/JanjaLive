import type { NativeAudioMode, NativeAudioStartResult } from "../../shared/contracts";

const PORT_TIMEOUT_MS = 8_000;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type NativeAudioCapture = {
  mode: Exclude<NativeAudioMode, "none">;
  stream: MediaStream;
  stop(): Promise<void>;
};

type PortEnvelope = { sessionId: string; port: MessagePort };

function nextNativeAudioPort() {
  let cleanup = () => undefined;
  const promise = new Promise<PortEnvelope>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("NATIVE_AUDIO_PORT_TIMEOUT"));
    }, PORT_TIMEOUT_MS);
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== window.location.origin || event.ports.length !== 1) return;
      const data = event.data;
      if (!data || typeof data !== "object" || (data as { type?: unknown }).type !== "janjalive:native-audio-port") return;
      const sessionId = (data as { sessionId?: unknown }).sessionId;
      if (typeof sessionId !== "string" || !SESSION_ID_PATTERN.test(sessionId)) {
        event.ports[0]?.close();
        return;
      }
      cleanup();
      resolve({ sessionId, port: event.ports[0]! });
    };
    cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
    };
    window.addEventListener("message", onMessage);
  });
  return { promise, cancel: cleanup };
}

export async function startNativeAudioCapture(videoStream: MediaStream, onEnded?: () => void): Promise<NativeAudioCapture | null> {
  const portRequest = nextNativeAudioPort();
  let result: NativeAudioStartResult;
  try {
    result = await window.janja.capture.startNativeAudio();
  } catch {
    portRequest.cancel();
    return null;
  }
  if (result.status !== "started") {
    portRequest.cancel();
    return null;
  }

  let envelope: PortEnvelope;
  try {
    envelope = await portRequest.promise;
  } catch {
    await window.janja.capture.stopNativeAudio(result.sessionId).catch(() => undefined);
    return null;
  }
  if (envelope.sessionId !== result.sessionId) {
    envelope.port.close();
    await window.janja.capture.stopNativeAudio(result.sessionId).catch(() => undefined);
    return null;
  }

  let context: AudioContext | null = null;
  let audioTrack: MediaStreamTrack | null = null;
  let portTransferred = false;
  try {
    context = new AudioContext({ latencyHint: "interactive", sampleRate: result.sampleRate });
    await context.audioWorklet.addModule(new URL("./pcm-audio-worklet.js", import.meta.url));
    const node = new AudioWorkletNode(context, "janjalive-pcm", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [result.channels],
      processorOptions: { channels: result.channels },
    });
    const destination = context.createMediaStreamDestination();
    node.connect(destination);
    audioTrack = destination.stream.getAudioTracks()[0] ?? null;
    if (!audioTrack) throw new Error("NATIVE_AUDIO_TRACK_UNAVAILABLE");
    videoStream.addTrack(audioTrack);

    node.port.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data && typeof event.data === "object" && (event.data as { type?: unknown }).type === "ended") {
        audioTrack?.stop();
        onEnded?.();
      }
    };
    node.port.postMessage({ type: "connect", port: envelope.port }, [envelope.port]);
    portTransferred = true;
    await context.resume();

    let stopped = false;
    return {
      mode: result.mode,
      stream: videoStream,
      async stop() {
        if (stopped) return;
        stopped = true;
        audioTrack?.stop();
        if (context && context.state !== "closed") await context.close().catch(() => undefined);
        await window.janja.capture.stopNativeAudio(result.sessionId).catch(() => undefined);
      },
    };
  } catch {
    if (!portTransferred) envelope.port.close();
    audioTrack?.stop();
    if (context && context.state !== "closed") await context.close().catch(() => undefined);
    await window.janja.capture.stopNativeAudio(result.sessionId).catch(() => undefined);
    return null;
  }
}
