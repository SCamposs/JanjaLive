"use client";

import { useActionState } from "react";
import { CallEntryActions } from "./call-entry-actions";
import { startCallAction, type CallStartState } from "@/app/discord/actions";

export function CallStart({ intentId }: { intentId: string }) {
  const [state, action, pending] = useActionState(startCallAction.bind(null, intentId), {} as CallStartState);
  const cardStatus = state.cardStatus ?? (state.cardPublished ? "published" : "pending");
  if (state.publicId) return <>
    <h1>Sala pronta</h1><p>Escolha onde continuar.</p>
    <CallEntryActions desktopLink={state.desktopLink!} publicId={state.publicId} />
    {cardStatus !== "published" && <><p role="status">{cardStatus === "failed" ? "A sala está pronta, mas não foi possível publicar o convite no Discord." : "A publicação do convite no Discord ainda não foi confirmada."}</p>
      <form action={action}><button className="button secondary" type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Verificando…" : cardStatus === "failed" ? "Tentar publicar o convite" : "Verificar convite"}</button></form></>}
  </>;
  return <><h1>Abra a sala da call</h1><p>Compartilhe sua tela ou assista com quem está na call.</p>
    <form action={action}>
      <button className="button primary" type="submit" disabled={pending} aria-busy={pending}>{pending ? "Preparando sala…" : "Continuar"}</button>
      {state.error && <p role="alert">{state.error}</p>}
    </form></>;
}
