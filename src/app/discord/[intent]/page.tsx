import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/api";
import { discordEnabled, discordMessage } from "@/lib/discord/config";
import { getCallIntent } from "@/lib/discord/calls";
import { CallNotice, CallShell } from "@/components/call-shell";
import { CallStart } from "@/components/call-start";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function DiscordCallPage({ params }: { params: Promise<{ intent: string }> }) {
  if (!discordEnabled()) notFound();
  const { intent } = await params;
  if (!/^[A-Za-z0-9_-]{32}$/.test(intent)) notFound();
  const user = await requireUser().catch(() => null);
  if (!user) redirect(`/?${new URLSearchParams({ returnTo: `/discord/${intent}` })}`);
  try { await getCallIntent(intent, user.id); }
  catch (error) { return <CallNotice message={discordMessage(error)} />; }
  return <CallShell><CallStart intentId={intent} /></CallShell>;
}
