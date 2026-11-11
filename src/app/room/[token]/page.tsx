import { notFound, redirect } from "next/navigation";
import { AccessGate } from "@/components/access-gate";
import { RoomExperience } from "@/components/room-experience";
import { getRoomSnapshot } from "@/lib/rooms";
import { requireUser } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await requireUser().catch(() => null);
  if (!user) redirect(`/?${new URLSearchParams({ returnTo: `/room/${token}` })}`);
  const snapshot = await getRoomSnapshot(token, user.id);
  if (!snapshot) notFound();
  if (snapshot.access !== "authorized") return <AccessGate roomId={snapshot.room.id} roomName={snapshot.room.name} state={snapshot.access} />;
  const isAdmin = await requireAdmin().then(() => true).catch(() => false);
  return <RoomExperience snapshot={snapshot} currentUser={user} isAdmin={isAdmin} />;
}
