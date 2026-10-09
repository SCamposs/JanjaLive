type RoomCue = "join" | "leave" | "stream-start";

let audioContext: AudioContext | null = null;

export async function playRoomCue(cue: RoomCue, allowResume = false) {
  if (typeof window === "undefined" || !("AudioContext" in window)) return;
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") {
    if (!allowResume) return;
    await audioContext.resume().catch(() => undefined);
  }
  if (audioContext.state !== "running") return;

  const now = audioContext.currentTime;
  const gain = audioContext.createGain();
  const notes = cue === "join" ? [246.94, 329.63] : cue === "leave" ? [293.66, 220] : [196, 293.66];
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.035, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
  gain.connect(audioContext.destination);

  notes.forEach((frequency, index) => {
    const oscillator = audioContext!.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now + index * 0.055);
    oscillator.connect(gain);
    oscillator.start(now + index * 0.055);
    oscillator.stop(now + 0.2 + index * 0.035);
  });
}
