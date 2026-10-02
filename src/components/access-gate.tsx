"use client";

import { CheckCircle2, Clock3, LoaderCircle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function AccessGate({ roomId, roomName, state }: { roomId: string; roomName: string; state: "invited" | "pending" | "rejected" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(state === "pending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!requested) return;
    const interval = setInterval(() => router.refresh(), 3_000);
    return () => clearInterval(interval);
  }, [requested, router]);

  async function requestAccess() {
    setLoading(true);
    setError(null);
    const response = await fetch(`/api/rooms/${roomId}/request`, { method: "POST" });
    if (response.ok) {
      setRequested(true);
      router.refresh();
    } else {
      setError("Não foi possível enviar a solicitação.");
    }
    setLoading(false);
  }

  return (
    <main className="centered-page">
      <div className="access-card">
        <span className="large-icon"><ShieldCheck size={26} /></span>
        <p className="section-kicker">Convite privado</p>
        <h1>{roomName}</h1>
        {requested ? (
          <>
            <Clock3 className="status-illustration" size={36} />
            <h2>Aguardando aprovação</h2>
            <p>O dono da sala recebeu sua solicitação. Esta página entra automaticamente assim que você for aprovado.</p>
            <button className="button secondary" type="button" onClick={() => router.refresh()}>Verificar novamente</button>
          </>
        ) : (
          <>
            <CheckCircle2 className="status-illustration" size={36} />
            <h2>Você foi convidado</h2>
            <p>Solicite acesso usando a sua conta do Discord. O dono decide quem pode entrar.</p>
            <button className="button primary wide" type="button" onClick={requestAccess} disabled={loading}>
              {loading ? <LoaderCircle className="spin" size={18} /> : null}
              {loading ? "Enviando…" : "Solicitar acesso"}
            </button>
          </>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </main>
  );
}
