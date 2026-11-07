import { useEffect, useRef, useState } from "react";
import type { OutboundDiagnostic } from "@janjalive/webrtc";

type Sample = { elapsedMs: number; peers: OutboundDiagnostic[]; failed: boolean };
type Props = { sharing: boolean; collect: () => Promise<OutboundDiagnostic[]>; version: string };
const SAMPLE_INTERVAL_MS = 2_000;
const MAX_DURATION_MS = 10 * 60_000;

export function TransmissionDiagnostics({ sharing, collect, version }: Props) {
  const [running, setRunning] = useState(false);
  const [previousSharing, setPreviousSharing] = useState(sharing);
  const [sampleCount, setSampleCount] = useState(0);
  const samples = useRef<Sample[]>([]);
  const startedAt = useRef(0);

  if (previousSharing !== sharing) {
    setPreviousSharing(sharing);
    if (!sharing) setRunning(false);
  }

  useEffect(() => {
    if (!running || !sharing) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function sample() {
      let peers: OutboundDiagnostic[] = [];
      let failed = false;
      try {
        peers = await collect();
      } catch {
        failed = true;
      }
      if (cancelled) return;
      const elapsedMs = performance.now() - startedAt.current;
      samples.current.push({ elapsedMs, peers, failed });
      setSampleCount(samples.current.length);
      if (elapsedMs >= MAX_DURATION_MS) setRunning(false);
      else timer = setTimeout(() => { void sample(); }, SAMPLE_INTERVAL_MS);
    }
    void sample();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [collect, running, sharing]);

  function start() {
    samples.current = [];
    startedAt.current = performance.now();
    setSampleCount(0);
    setRunning(true);
  }

  function download() {
    setRunning(false);
    const report = {
      schemaVersion: 1,
      appVersion: version,
      sampleIntervalMs: SAMPLE_INTERVAL_MS,
      // Counters are cumulative. Compare deltas for the same peer between samples.
      samples: samples.current,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "janjalive-diagnostico.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  if (!sharing && sampleCount === 0) return null;
  return <details className="transmission-diagnostics">
    <summary>Diagnóstico da transmissão{running ? " · Gravando" : ""}</summary>
    <p>Registra dados técnicos neste dispositivo por até 10 minutos.</p>
    <div>
      {running
        ? <button type="button" className="quiet-button" onClick={() => setRunning(false)}>Parar coleta</button>
        : sharing && <button type="button" className="quiet-button" onClick={start}>{sampleCount ? "Nova coleta" : "Iniciar coleta"}</button>}
      <button type="button" className="quiet-button" disabled={sampleCount === 0} onClick={download}>Salvar diagnóstico</button>
    </div>
    <small role="status">{sampleCount} amostras coletadas</small>
  </details>;
}
