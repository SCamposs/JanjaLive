"use client";

import { ArrowRight, LoaderCircle, LockKeyhole, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Toast } from "./toast";

const ROOM_CODE_LENGTH = 7;

function normalizeRoomCode(value: string) {
  return (value.toUpperCase().match(/[2-9A-HJ-NP-Z]/g) ?? []).join("").slice(0, ROOM_CODE_LENGTH);
}

export function CreateRoomForm() {
  const router = useRouter();
  const codeInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [accessMode, setAccessMode] = useState<"APPROVAL" | "INVITE">("APPROVAL");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function createRoom() {
    setCreating(true);
    setCreateError(null);
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
      setCreateError(cause instanceof Error ? cause.message : "Não foi possível criar a sala.");
      setCreating(false);
    }
  }

  async function joinRoom(roomCode: string) {
    if (joining || roomCode.length !== ROOM_CODE_LENGTH) return;

    setJoining(true);
    setJoinError(null);
    try {
      const response = await fetch("/api/rooms/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode }),
      });
      if (!response.ok) throw new Error("Sala não encontrada ou código inválido.");
      const data = (await response.json()) as { joinPath: string };
      router.push(data.joinPath);
    } catch (cause) {
      setJoinError(cause instanceof Error ? cause.message : "Não foi possível entrar.");
      setJoining(false);
      window.requestAnimationFrame(() => {
        codeInputRef.current?.focus();
        codeInputRef.current?.select();
      });
    }
  }

  function updateCode(value: string) {
    const nextCode = normalizeRoomCode(value);
    setCode(nextCode);
    setJoinError(null);

    if (nextCode.length === ROOM_CODE_LENGTH) void joinRoom(nextCode);
  }

  return (
    <section className="create-room-card">
      <h2>Nova sala</h2>
      <label className="field-label" htmlFor="room-name">Nome da sala <span>opcional</span></label>
      <input id="room-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} />
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
      {createError && <p className="form-error" role="alert">{createError}</p>}
      <button type="button" className="button primary wide create-room-submit" onClick={createRoom} disabled={creating || joining}>
        <span>{creating ? "Criando…" : "Criar sala"}</span>
        {creating ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
      </button>
      <div className="join-divider"><span /> ou entre com código <span /></div>
      <form onSubmit={(event) => { event.preventDefault(); void joinRoom(code); }}>
        <label className="code-entry" data-loading={joining} htmlFor="room-code">
          <input
            ref={codeInputRef}
            id="room-code"
            className="code-entry-input"
            aria-label="Código da sala, 7 caracteres"
            autoCapitalize="characters"
            autoComplete="off"
            disabled={creating || joining}
            inputMode="text"
            onChange={(event) => updateCode(event.target.value)}
            spellCheck={false}
            value={code}
          />
          <span className="code-slots" aria-hidden="true">
            {Array.from({ length: ROOM_CODE_LENGTH }, (_, index) => (
              <span
                className="code-slot"
                data-active={!joining && index === code.length}
                data-filled={Boolean(code[index])}
                key={index}
              >
                {code[index] ?? ""}
              </span>
            ))}
          </span>
          {joining && <LoaderCircle className="code-entry-loader spin" size={18} aria-hidden="true" />}
        </label>
      </form>
      {joinError && <Toast message={joinError} onDismiss={() => setJoinError(null)} />}
    </section>
  );
}
