export function setPreferredVideoCodec(peer: RTCPeerConnection, mimeType: string): boolean {
  if (typeof RTCRtpSender === "undefined" || typeof RTCRtpSender.getCapabilities !== "function"
    || typeof peer.getTransceivers !== "function") return false;

  try {
    const codecs = RTCRtpSender.getCapabilities("video")?.codecs ?? [];
    const preferred = codecs.filter((codec) => codec.mimeType.toLowerCase() === mimeType.toLowerCase());
    if (!preferred.length) return false;
    // Keep every supported fallback, including retransmission and error correction.
    const ordered = [...preferred, ...codecs.filter((codec) => !preferred.includes(codec))];
    let applied = false;
    for (const transceiver of peer.getTransceivers()) {
      if (transceiver.sender.track?.kind !== "video" || typeof transceiver.setCodecPreferences !== "function") continue;
      transceiver.setCodecPreferences(ordered);
      applied = true;
    }
    return applied;
  } catch {
    // Unsupported preferences must not interrupt the existing negotiation.
    return false;
  }
}
