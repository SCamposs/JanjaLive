import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { listAdminUsers } from "@/lib/account-access";
import { requireAdmin } from "@/lib/admin";
import { AdminUsers } from "./admin-users";
import { getOperationalStatus } from "@/lib/operational-status";
import { listDiscordGuilds } from "@/lib/discord/guilds";
import { AdminDiscordGuilds } from "./admin-discord-guilds";
import { discordInstallUrl } from "@/lib/discord/config";
import { AdminSections } from "./admin-sections";

export const dynamic = "force-dynamic";
export const metadata = { title: "Controle | JanjaLive", robots: { index: false, follow: false } };

async function loadAdminPage() {
  try {
    const admin = await requireAdmin();
    const [usersPage, operations, guildsPage] = await Promise.all([listAdminUsers(), getOperationalStatus(), listDiscordGuilds()]);
    return { admin, usersPage, operations, guildsPage };
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
      <section className="admin-overview" aria-label="Estado do serviço">
        <dl className="admin-metrics">
          <div><dt>Salas ativas</dt><dd>{data.operations.activeRooms}</dd></div>
          <div><dt>Contas banidas</dt><dd>{data.operations.bannedUsers}</dd></div>
          <div><dt>Credenciais TURN válidas</dt><dd>{data.operations.activeTurnCredentials}</dd></div>
          <div><dt>Revogações pendentes</dt><dd>{data.operations.pendingDisconnects}</dd></div>
        </dl>
        <p>Novas salas: {process.env.ROOM_CREATION_ENABLED === "false" ? "pausadas" : "habilitadas"} · Emissão TURN: {process.env.TURN_ENABLED === "false" ? "pausada" : "habilitada"}</p>
      </section>
      <AdminSections users={
        <section className="admin-card" aria-labelledby="admin-users-title">
          <h1 id="admin-users-title">Usuários</h1>
          <p>Banimento de acesso e revogação imediata de sessões.</p>
          <AdminUsers initialData={data.usersPage} ownerUserId={data.admin.id} />
        </section>
      } guilds={<AdminDiscordGuilds initialData={data.guildsPage} installUrl={discordInstallUrl(process.env.DISCORD_BOT_APPLICATION_ID)} />} />
    </main>
  );
}
