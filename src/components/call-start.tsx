"use client";

import { useActionState } from "react";
import Link from "next/link";
import { startCallAction, type CallStartState } from "@/app/discord/actions";

export function CallStart({ intentId }: { intentId: string }) {
  const [state, action, pending] = useActionState(startCallAction.bind(null, intentId), {} as CallStartState);
  if (state.publicId) return <>
    <h1>Sala pronta</h1><p>Escolha onde continuar.</p>
    <div className="call-entry-actions">
      <a className="button primary" href={state.desktopLink}>Abrir no aplicativo</a>
      <Link className="button secondary" href={`/join/${state.publicId}`}>Continuar no navegador</Link>
    </div>
    {!state.cardPublished && <><p role="status">A sala está pronta, mas o convite não foi publicado no Discord.</p>
      <form action={action}><button className="button secondary" type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Verificando…" : "Tentar publicar o convite"}</button></form></>}
  </>;
  return <><h1>Abra a sala da call</h1><p>Compartilhe sua tela ou assista com quem está na call.</p>
    <form action={action}>
      <button className="button primary" type="submit" disabled={pending} aria-busy={pending}>{pending ? "Preparando sala…" : "Continuar"}</button>
      {state.error && <p role="alert">{state.error}</p>}
    </form></>;
}
