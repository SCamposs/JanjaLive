import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { listAdminUsers } from "@/lib/account-access";
import { requireAdmin } from "@/lib/admin";
import { AdminUsers } from "./admin-users";

export const dynamic = "force-dynamic";
export const metadata = { title: "Controle | JanjaLive", robots: { index: false, follow: false } };

async function loadAdminPage() {
  try {
    const admin = await requireAdmin();
    const usersPage = await listAdminUsers();
    return { admin, usersPage };
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
        <div><h1>Usuários</h1><p>Banimento de acesso e revogação imediata de sessões.</p></div>
        <AdminUsers initialData={data.usersPage} ownerUserId={data.admin.id} />
      </section>
    </main>
  );
}
