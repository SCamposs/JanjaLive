"use client";

import { Clock3, LoaderCircle, ShieldCheck } from "lucide-react";
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
        <header className="access-heading">
          <span className="large-icon">{requested ? <Clock3 size={24} /> : <ShieldCheck size={24} />}</span>
          <div><span>Convite para</span><h1>{roomName}</h1></div>
        </header>
        {requested ? (
          <section className="access-body">
            <h2>Aguardando aprovação</h2>
            <p>Você entrará automaticamente quando o dono aprovar.</p>
            <button className="button secondary" type="button" onClick={() => router.refresh()}>Verificar novamente</button>
          </section>
        ) : (
          <section className="access-body">
            <h2>Entrar na sala</h2>
            <p>O dono precisa aprovar sua entrada.</p>
            <button className="button primary wide" type="button" onClick={requestAccess} disabled={loading}>
              {loading ? <LoaderCircle className="spin" size={18} /> : null}
              {loading ? "Enviando…" : "Solicitar acesso"}
            </button>
          </section>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </main>
  );
}
