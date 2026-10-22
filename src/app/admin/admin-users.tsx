"use client";

import { useState } from "react";
import { UserAvatar } from "@/components/user-avatar";

type AdminUser = {
  id: string;
  discordId: string | null;
  username: string | null;
  displayName: string | null;
  name: string | null;
  avatar: string | null;
  image: string | null;
  accountStatus: "ACTIVE" | "BANNED";
  createdAt: Date | string;
  accessChangedAt: Date | string | null;
};

export function AdminUsers({ initialUsers, ownerUserId }: { initialUsers: AdminUser[]; ownerUserId: string }) {
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const response = await fetch(`/api/admin/users?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("SEARCH_FAILED");
      setUsers(((await response.json()) as { users: AdminUser[] }).users);
    } catch {
      setError("Não foi possível carregar os usuários.");
    }
  }

  async function changeAccess(user: AdminUser) {
    const action = user.accountStatus === "ACTIVE" ? "BAN" : "UNBAN";
    if (action === "BAN" && !window.confirm(`Banir ${user.displayName || user.username || user.name || user.id}?`)) return;
    setBusy(user.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error("ACTION_FAILED");
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, accountStatus: action === "BAN" ? "BANNED" : "ACTIVE" } : item));
    } catch {
      setError("Não foi possível alterar o acesso. Tente novamente.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-users">
      <form className="admin-search" onSubmit={search}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, ID interno ou Discord ID" aria-label="Buscar usuários" />
        <button className="button secondary" type="submit">Buscar</button>
      </form>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <div className="admin-user-list">
        {users.map((user) => {
          const name = user.displayName || user.username || user.name || "Usuário";
          const image = user.avatar || user.image;
          const owner = user.id === ownerUserId;
          return <article className="admin-user" key={user.id}>
            <div className="admin-user-identity"><UserAvatar name={name} image={image} size={38} /><div><strong>{name}</strong><small>{user.id}</small><small>Discord: {user.discordId || "não disponível"}</small><small>Criado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(user.createdAt))}</small></div></div>
            <div className="admin-user-action"><span className={user.accountStatus === "BANNED" ? "banned" : "active"}>{owner ? "Proprietário" : user.accountStatus === "BANNED" ? "Banido" : "Ativo"}</span><button className={user.accountStatus === "BANNED" ? "button secondary compact" : "button danger compact"} type="button" disabled={owner || busy === user.id} onClick={() => void changeAccess(user)}>{user.accountStatus === "BANNED" ? "Desbanir" : "Banir"}</button></div>
          </article>;
        })}
      </div>
    </div>
  );
}
