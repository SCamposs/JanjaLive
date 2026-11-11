import { notFound, redirect } from "next/navigation";
import { AccessGate } from "@/components/access-gate";
import { RoomExperience } from "@/components/room-experience";
import { getRoomSnapshotByPublicId } from "@/lib/rooms";
import { requireUser } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function JoinRoomPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const user = await requireUser().catch(() => null);
  if (!user) redirect(`/?${new URLSearchParams({ returnTo: `/join/${publicId}` })}`);
  const snapshot = await getRoomSnapshotByPublicId(publicId, user.id);
  if (!snapshot) notFound();
  if (snapshot.access !== "authorized") return <AccessGate roomId={snapshot.room.id} roomName={snapshot.room.name} state={snapshot.access} />;
  const isAdmin = await requireAdmin().then(() => true).catch(() => false);
  return <RoomExperience snapshot={snapshot} currentUser={user} isAdmin={isAdmin} />;
}
