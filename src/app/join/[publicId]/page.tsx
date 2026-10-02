import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AccessGate } from "@/components/access-gate";
import { RoomExperience } from "@/components/room-experience";
import { getRoomSnapshotByPublicId } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export default async function JoinRoomPage({ params }: { params: Promise<{ publicId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const { publicId } = await params;
  const snapshot = await getRoomSnapshotByPublicId(publicId, session.user.id);
  if (!snapshot) notFound();
  if (snapshot.access !== "authorized") return <AccessGate roomId={snapshot.room.id} roomName={snapshot.room.name} state={snapshot.access} />;
  return <RoomExperience snapshot={snapshot} currentUser={session.user} />;
}
