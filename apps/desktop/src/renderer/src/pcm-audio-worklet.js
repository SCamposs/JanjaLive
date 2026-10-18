class JanjaPcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.channels = Math.max(1, Math.min(8, options.processorOptions?.channels ?? 2));
    this.capacity = Math.max(16_384, Math.round(sampleRate * this.channels * 2));
    this.samples = new Float32Array(this.capacity);
    this.readIndex = 0;
    this.writeIndex = 0;
    this.available = 0;
    this.port.onmessage = (event) => {
      const control = event.data;
      if (!control || control.type !== "connect" || !(control.port instanceof MessagePort)) return;
      const capturePort = control.port;
      capturePort.onmessage = (captureEvent) => {
        const data = captureEvent.data;
        if (data?.type === "ended") {
          this.port.postMessage({ type: "ended" });
          return;
        }
        if (!data || data.type !== "pcm" || !(data.data instanceof ArrayBuffer)) return;
        if (data.data.byteLength === 0 || data.data.byteLength > 1024 * 1024 || data.data.byteLength % 2 !== 0) return;
        const input = new Int16Array(data.data);
        for (let index = 0; index < input.length; index += 1) {
          if (this.available === this.capacity) {
            this.readIndex = (this.readIndex + 1) % this.capacity;
            this.available -= 1;
          }
          this.samples[this.writeIndex] = input[index] / 32_768;
          this.writeIndex = (this.writeIndex + 1) % this.capacity;
          this.available += 1;
        }
      };
      capturePort.start();
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const frameCount = output[0]?.length ?? 0;
    for (let frame = 0; frame < frameCount; frame += 1) {
      if (this.available < this.channels) {
        for (const channel of output) channel[frame] = 0;
        continue;
      }
      const frameStart = this.readIndex;
      for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
        const inputChannel = Math.min(channelIndex, this.channels - 1);
        output[channelIndex][frame] = this.samples[(frameStart + inputChannel) % this.capacity] ?? 0;
      }
      this.readIndex = (this.readIndex + this.channels) % this.capacity;
      this.available -= this.channels;
    }
    return true;
  }
}

registerProcessor("janjalive-pcm", JanjaPcmProcessor);
