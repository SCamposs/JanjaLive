import { notFound, redirect } from "next/navigation";
import { AccessGate } from "@/components/access-gate";
import { RoomExperience } from "@/components/room-experience";
import { getRoomSnapshot } from "@/lib/rooms";
import { requireUser } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { CallNotice } from "@/components/call-shell";
import { discordMessage } from "@/lib/discord/config";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await requireUser().catch(() => null);
  if (!user) redirect(`/?${new URLSearchParams({ returnTo: `/room/${token}` })}`);
  let snapshot;
  try { snapshot = await getRoomSnapshot(token, user.id); }
  catch (error) {
    if (error instanceof Error && (error.message.startsWith("DISCORD_") || error.message === "ROOM_FORBIDDEN")) return <CallNotice message={discordMessage(error)} />;
    throw error;
  }
  if (!snapshot) notFound();
  if (snapshot.access !== "authorized") return <AccessGate roomId={snapshot.room.id} roomName={snapshot.room.name} state={snapshot.access} />;
  const isAdmin = await requireAdmin().then(() => true).catch(() => false);
  return <RoomExperience snapshot={snapshot} currentUser={user} isAdmin={isAdmin} />;
}
