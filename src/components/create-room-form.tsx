"use client";

import { ArrowRight, LoaderCircle, LockKeyhole, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateRoomForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [accessMode, setAccessMode] = useState<"APPROVAL" | "INVITE">("APPROVAL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function createRoom() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, accessMode }),
      });
      if (!response.ok) throw new Error("Não foi possível criar a sala.");
      const data = (await response.json()) as { invitePath: string };
      router.push(data.invitePath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar a sala.");
      setLoading(false);
    }
  }

  async function joinRoom() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/rooms/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) throw new Error("Sala não encontrada ou código inválido.");
      const data = (await response.json()) as { joinPath: string };
      router.push(data.joinPath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível entrar.");
      setLoading(false);
    }
  }

  return (
    <section className="create-room-card">
      <h2>Nova sala</h2>
      <label className="field-label" htmlFor="room-name">Nome da sala <span>opcional</span></label>
      <input id="room-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Noite de jogo" />
      <fieldset className="access-options">
        <legend>Quem pode entrar?</legend>
        <button type="button" data-active={accessMode === "APPROVAL"} onClick={() => setAccessMode("APPROVAL")}>
          <LockKeyhole size={18} />
          <span><strong>Com minha aprovação</strong><small>Você aceita cada pessoa antes de ela entrar.</small></span>
        </button>
        <button type="button" data-active={accessMode === "INVITE"} onClick={() => setAccessMode("INVITE")}>
          <Users size={18} />
          <span><strong>Quem tiver o convite</strong><small>A conta Discord continua sendo obrigatória.</small></span>
        </button>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="button" className="button primary wide" onClick={createRoom} disabled={loading}>
        {loading ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
        {loading ? "Criando…" : "Criar sala"}
      </button>
      <div className="join-divider"><span /> ou entre com código <span /></div>
      <div className="join-code-row">
        <input className="text-input" aria-label="Código da sala" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={7} placeholder="7 CARACTERES" />
        <button type="button" className="button secondary" onClick={joinRoom} disabled={loading || code.length !== 7}>Entrar</button>
      </div>
    </section>
  );
}
