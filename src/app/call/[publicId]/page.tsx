import { CallEntryActions } from "@/components/call-entry-actions";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/api";
import { getDb } from "@/db";
import { rooms } from "@/db/schema";
import { discordEnabled, discordMessage } from "@/lib/discord/config";
import { assertGuildAdmission } from "@/lib/discord/guilds";
import { desktopCallLink } from "@/lib/discord/calls";
import { isAvailableRoom } from "@/lib/rooms";
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
  if (!room?.discordGuildId || !await isAvailableRoom(room)) return <CallNotice message="Esta sessão foi encerrada. Use /janja no Discord para continuar." />;
  try { await assertGuildAdmission(room.discordGuildId); }
  catch (error) { return <CallNotice message={discordMessage(error)} />; }
  return <CallShell><h1>Entre na sala da call</h1><p>Continue com a mesma conta usada no Discord.</p>
    <CallEntryActions desktopLink={desktopCallLink(room)} publicId={room.publicId} /></CallShell>;
}
