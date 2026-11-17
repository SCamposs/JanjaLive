"use client";

import { useRef, useState } from "react";
import { TextInput } from "@janjalive/ui";
import { Dialog } from "@janjalive/ui/dialog";
import { ExternalLink } from "lucide-react";

type Guild = { id: string; name: string; blocked: boolean; syncPending: boolean };
type GuildPage = { guilds: Guild[]; page: number; total: number; totalPages: number };

export function AdminDiscordGuilds({ initialData, installUrl }: { initialData: GuildPage; installUrl?: string | null }) {
  const [data, setData] = useState(initialData);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Guild | null>(null);
  const lock = useRef(false);

  async function load(page: number, search = appliedQuery) {
    if (lock.current) return;
    lock.current = true; setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/admin/discord-guilds?${new URLSearchParams({ q: search, page: String(page) })}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setData(await response.json() as GuildPage);
    } catch { setError("Não foi possível carregar os servidores. Tente novamente."); }
    finally { lock.current = false; setLoading(false); }
  }

  async function change(guild: Guild, blocked: boolean) {
    if (lock.current) return;
    lock.current = true; setBusy(guild.id); setError(null);
    try {
      const response = await fetch(`/api/admin/discord-guilds/${guild.id}/access`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocked }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok && payload?.error !== "DISCORD_GUILD_SYNC_PENDING") throw new Error();
      setData(current => ({ ...current, guilds: current.guilds.map(item => item.id === guild.id
        ? { ...item, blocked, syncPending: !response.ok } : item) }));
      setConfirm(null);
      if (!response.ok) setError("A alteração foi salva, mas ainda não foi confirmada. Clique em Concluir alteração para tentar novamente.");
    } catch { setError("Não foi possível alterar o acesso do servidor. Tente novamente."); }
    finally { lock.current = false; setBusy(null); }
  }

  return <section className="admin-card admin-guilds" aria-labelledby="admin-guilds-title">
    <div className="admin-guilds-heading"><h2 id="admin-guilds-title">Servidores do Discord</h2>
      {installUrl && <a className="button secondary compact" href={installUrl} target="_blank" rel="noopener noreferrer">Adicionar bot <ExternalLink size={14} aria-hidden="true" /></a>}
    </div>
    <p>Servidores com o bot instalado funcionam automaticamente. O bloqueio impede novos comandos e entradas; salas em uso continuam ativas.</p>
    <form className="admin-search" onSubmit={event => { event.preventDefault(); if (lock.current) return;
      const search = query.trim(); setAppliedQuery(search); void load(1, search); }}>
      <TextInput className="jl-input" type="search" aria-label="Buscar servidores" placeholder="Nome ou ID do servidor" value={query} onValueChange={setQuery} />
      <button className="button secondary" disabled={loading || busy !== null} type="submit">Buscar</button>
    </form>
    {error && !confirm && <p className="admin-error" role="alert">{error}</p>}
    <div className="admin-user-list" aria-busy={loading || busy !== null}>
      {data.guilds.map(guild => <article className="admin-user" key={guild.id}>
        <div className="admin-user-identity"><div><strong>{guild.name}</strong><small>{guild.id}</small></div></div>
        <div className="admin-user-action"><span className={guild.blocked ? "banned" : "active"}>{guild.syncPending ? "Confirmação pendente" : guild.blocked ? "Bloqueado" : "Disponível"}</span>
          {guild.syncPending && <button className="button secondary compact" disabled={loading || busy !== null} onClick={() => void change(guild, guild.blocked)}>Concluir alteração</button>}
          <button className={`button ${guild.blocked ? "secondary" : "danger"} compact`} disabled={loading || busy !== null}
            aria-label={`${guild.blocked ? "Desbloquear" : "Bloquear"} ${guild.name}`} onClick={() => {
              if (guild.blocked) void change(guild, false); else { setError(null); setConfirm(guild); }
            }}>
            {busy === guild.id ? "Salvando…" : guild.blocked ? "Desbloquear" : "Bloquear"}</button>
        </div>
      </article>)}
      {!data.guilds.length && <p className="admin-empty">{appliedQuery ? "Nenhum servidor encontrado." : "Os servidores aparecem aqui após o primeiro uso do bot."}</p>}
    </div>
    <nav className="admin-pagination" aria-label="Paginação de servidores"><span>{data.total} servidores</span><div>
      <button className="button secondary compact" disabled={loading || busy !== null || data.page <= 1} onClick={() => void load(data.page - 1)}>Anterior</button>
      <span>Página {data.page} de {data.totalPages}</span>
      <button className="button secondary compact" disabled={loading || busy !== null || data.page >= data.totalPages} onClick={() => void load(data.page + 1)}>Próxima</button>
    </div></nav>
    <Dialog.Root open={confirm !== null} onOpenChange={(open, details) => { if (!open) { if (busy) details.cancel(); else setConfirm(null); } }}>
      <Dialog.Portal><Dialog.Backdrop className="jl-confirm-backdrop" /><div className="jl-confirm-positioner">
        <Dialog.Popup className="jl-confirm-popup" aria-busy={busy !== null}>
          <Dialog.Title className="jl-confirm-title">Bloquear servidor?</Dialog.Title>
          <Dialog.Description className="jl-confirm-description">Novos comandos e entradas em <strong>{confirm?.name}</strong> serão bloqueados. As salas em uso continuam funcionando. Você pode desbloquear depois.</Dialog.Description>
          {error && <p className="jl-confirm-error" role="alert">{error}</p>}
          <div className="jl-confirm-actions"><Dialog.Close className="jl-confirm-cancel" disabled={busy !== null}>Cancelar</Dialog.Close>
            <button className="jl-confirm-submit" disabled={busy !== null} onClick={() => confirm && void change(confirm, true)}>{busy ? "Bloqueando…" : "Bloquear servidor"}</button></div>
        </Dialog.Popup></div></Dialog.Portal>
    </Dialog.Root>
  </section>;
}
