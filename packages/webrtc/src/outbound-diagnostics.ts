const peerNumbers = new WeakMap<RTCPeerConnection, number>();
const streamNumbers = new WeakMap<RTCPeerConnection, Map<string, number>>();
let nextPeerNumber = 1;

type StatValues = Record<string, string | number | boolean>;

export type OutboundDiagnostic = {
  peer: number;
  state: RTCPeerConnectionState;
  failed: boolean;
  video: StatValues[];
};

// Export only selected measurements. Raw reports contain network identifiers.
function selectValues(report: Record<string, unknown> | undefined, fields: string[]): StatValues {
  const values: StatValues = {};
  for (const field of fields) {
    const value = report?.[field];
    if (typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
      values[field] = value;
    }
  }
  return values;
}

export async function collectOutboundDiagnostic(peer: RTCPeerConnection): Promise<OutboundDiagnostic> {
  let number = peerNumbers.get(peer);
  if (number === undefined) {
    number = nextPeerNumber++;
    peerNumbers.set(peer, number);
  }
  const result: OutboundDiagnostic = { peer: number, state: peer.connectionState, failed: false, video: [] };
  try {
    const reports = await peer.getStats();
    let streams = streamNumbers.get(peer);
    if (!streams) {
      streams = new Map();
      streamNumbers.set(peer, streams);
    }
    const knownStreams = streams;
    reports.forEach((report) => {
      if (report.type !== "outbound-rtp" || report.kind !== "video") return;
      if (!knownStreams.has(report.id)) knownStreams.set(report.id, knownStreams.size + 1);
      const codec = reports.get(report.codecId);
      const remote = reports.get(report.remoteId);
      const transport = reports.get(report.transportId);
      const pair = reports.get(transport?.selectedCandidatePairId);
      const source = reports.get(report.mediaSourceId);
      const values = selectValues(report, [
        "timestamp", "bytesSent", "packetsSent", "framesEncoded", "framesSent",
        "framesPerSecond", "frameWidth", "frameHeight", "totalEncodeTime",
        "totalPacketSendDelay", "targetBitrate", "retransmittedBytesSent",
        "retransmittedPacketsSent", "nackCount", "pliCount", "firCount", "qpSum",
        "qualityLimitationReason", "qualityLimitationResolutionChanges",
        "encoderImplementation", "powerEfficientEncoder", "keyFramesEncoded",
      ]);
      values.stream = knownStreams.get(report.id)!;
      Object.assign(values, selectValues(codec, ["mimeType", "sdpFmtpLine"]));
      for (const [prefix, related, fields] of [
        ["remote", remote, ["packetsLost", "fractionLost", "roundTripTime", "jitter", "timestamp"]],
        ["network", pair, ["availableOutgoingBitrate", "currentRoundTripTime"]],
        ["source", source, ["frames", "framesPerSecond", "width", "height"]],
        ["limitedSeconds", report.qualityLimitationDurations, ["none", "cpu", "bandwidth", "other"]],
      ] as const) {
        const selected = selectValues(related, [...fields]);
        for (const [field, value] of Object.entries(selected)) values[`${prefix}.${field}`] = value;
      }
      result.video.push(values);
    });
  } catch {
    result.failed = true;
  }
  return result;
}
