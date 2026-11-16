import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/api";
import { getDb } from "@/db";
import { rooms } from "@/db/schema";
import { discordEnabled } from "@/lib/discord/config";
import { desktopCallLink } from "@/lib/discord/calls";
import { isRoomActive } from "@/lib/room-policy";
import { CallNotice, CallShell } from "@/components/call-shell";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function CallEntryPage({ params }: { params: Promise<{ publicId: string }> }) {
  if (!discordEnabled()) notFound();
  const { publicId } = await params;
  if (!/^[A-Za-z0-9_-]{18}$/.test(publicId)) notFound();
  const user = await requireUser().catch(() => null);
  if (!user) redirect(`/?${new URLSearchParams({ returnTo: `/call/${publicId}` })}`);
  const [room] = await getDb().select().from(rooms).where(eq(rooms.publicId, publicId)).limit(1);
  if (!room?.discordGuildId || !isRoomActive(room)) return <CallNotice message="Esta sessão foi encerrada. Use /janja no Discord para continuar." />;
  return <CallShell><h1>Entre na sala da call</h1><p>Continue com a mesma conta usada no Discord.</p>
    <div className="call-entry-actions"><a className="button primary" href={desktopCallLink(room)}>Abrir no aplicativo</a>
      <Link className="button secondary" href={`/join/${room.publicId}`}>Continuar no navegador</Link></div></CallShell>;
}
