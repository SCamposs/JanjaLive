"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
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

type AdminUserOrder = "newest" | "oldest";

type AdminUserPage = {
  users: AdminUser[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  order: AdminUserOrder;
};

export function AdminUsers({ initialData, ownerUserId }: { initialData: AdminUserPage; ownerUserId: string }) {
  const [data, setData] = useState(initialData);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [order, setOrder] = useState<AdminUserOrder>(initialData.order);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadUsers(page: number, nextOrder: AdminUserOrder, search: string) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: search, order: nextOrder, page: String(page) });
      const response = await fetch(`/api/admin/users?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("SEARCH_FAILED");
      setData((await response.json()) as AdminUserPage);
    } catch {
      setError("Não foi possível carregar os usuários.");
    } finally {
      setLoading(false);
    }
  }

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const nextQuery = query.trim();
    setAppliedQuery(nextQuery);
    await loadUsers(1, order, nextQuery);
  }

  async function changeOrder(nextOrder: AdminUserOrder) {
    setOrder(nextOrder);
    await loadUsers(1, nextOrder, appliedQuery);
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
      setData((current) => ({
        ...current,
        users: current.users.map((item) => item.id === user.id ? { ...item, accountStatus: action === "BAN" ? "BANNED" : "ACTIVE" } : item),
      }));
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
        <span className="admin-sort-select">
          <select value={order} onChange={(event) => void changeOrder(event.target.value as AdminUserOrder)} aria-label="Ordenar usuários" disabled={loading}>
            <option value="newest">Mais recentes</option>
            <option value="oldest">Mais antigos</option>
          </select>
          <ChevronDown aria-hidden="true" size={15} strokeWidth={1.8} />
        </span>
        <button className="button secondary" type="submit" disabled={loading}>Buscar</button>
      </form>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <div className="admin-user-list" aria-busy={loading}>
        {data.users.map((user) => {
          const name = user.displayName || user.username || user.name || "Usuário";
          const image = user.avatar || user.image;
          const owner = user.id === ownerUserId;
          return <article className="admin-user" key={user.id}>
            <div className="admin-user-identity"><UserAvatar name={name} image={image} size={38} /><div><strong>{name}</strong><small>{user.id}</small><small>Discord: {user.discordId || "não disponível"}</small><small>Criado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(user.createdAt))}</small></div></div>
            <div className="admin-user-action"><span className={user.accountStatus === "BANNED" ? "banned" : "active"}>{owner ? "Proprietário" : user.accountStatus === "BANNED" ? "Banido" : "Ativo"}</span><button className={user.accountStatus === "BANNED" ? "button secondary compact" : "button danger compact"} type="button" disabled={owner || busy === user.id} onClick={() => void changeAccess(user)}>{user.accountStatus === "BANNED" ? "Desbanir" : "Banir"}</button></div>
          </article>;
        })}
        {data.users.length === 0 && <p className="admin-empty">Nenhum usuário encontrado.</p>}
      </div>
      <nav className="admin-pagination" aria-label="Paginação de usuários">
        <span>{data.total === 0 ? "0 usuários" : `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} de ${data.total}`}</span>
        <div>
          <button className="button secondary compact" type="button" disabled={loading || data.page <= 1} onClick={() => void loadUsers(data.page - 1, order, appliedQuery)}>Anterior</button>
          <span>Página {data.page} de {data.totalPages}</span>
          <button className="button secondary compact" type="button" disabled={loading || data.page >= data.totalPages} onClick={() => void loadUsers(data.page + 1, order, appliedQuery)}>Próxima</button>
        </div>
      </nav>
    </div>
  );
}
