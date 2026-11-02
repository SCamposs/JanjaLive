import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { listAdminUsers } from "@/lib/account-access";
import { requireAdmin } from "@/lib/admin";
import { AdminUsers } from "./admin-users";
import { getOperationalStatus } from "@/lib/operational-status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Controle | JanjaLive", robots: { index: false, follow: false } };

async function loadAdminPage() {
  try {
    const admin = await requireAdmin();
    const [usersPage, operations] = await Promise.all([listAdminUsers(), getOperationalStatus()]);
    return { admin, usersPage, operations };
  } catch {
    return null;
  }
}

export default async function AdminPage() {
  const data = await loadAdminPage();
  if (!data) notFound();
  return (
    <main className="admin-shell">
      <header className="admin-header"><Brand /><span>Controle de acesso</span></header>
      <section className="admin-card">
        <p role="status">{data.operations.activeRooms} salas ativas · {data.operations.bannedUsers} contas banidas · {data.operations.activeTurnCredentials} credenciais TURN válidas · {data.operations.pendingDisconnects} revogações pendentes</p>
        <p>Novas salas: {process.env.ROOM_CREATION_ENABLED === "false" ? "pausadas" : "habilitadas"}. Emissão TURN: {process.env.TURN_ENABLED === "false" ? "pausada" : "habilitada"}.</p>
        <div><h1>Usuários</h1><p>Banimento de acesso e revogação imediata de sessões.</p></div>
        <AdminUsers initialData={data.usersPage} ownerUserId={data.admin.id} />
      </section>
    </main>
  );
}
