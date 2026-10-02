import { ArrowRight } from "lucide-react";
import { auth, signIn } from "@/auth";
import { AccountMenu } from "@/components/account-menu";
import { Brand } from "@/components/brand";
import { CreateRoomForm } from "@/components/create-room-form";
import { LandingNoirBackground } from "@/components/landing-noir-background";
import { LegalFooter } from "@/components/legal-footer";
import { RoomList } from "@/components/room-list";
import { listAvailableRooms } from "@/lib/rooms";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    const displayName = session.user.name?.split(" ")[0] ?? "Conta Discord";
    const availableRooms = session.user.id ? await listAvailableRooms(session.user.id) : [];

    return (
      <main className="home-shell signed-in-home">
        <header className="landing-header">
          <Brand />
          <AccountMenu image={session.user.image} name={displayName} />
        </header>
        <div className="home-content">
          <section className="home-intro">
            <h1>Salas</h1>
            <p>Crie uma sala ou entre com um código.</p>
            <RoomList rooms={availableRooms} />
          </section>
          <CreateRoomForm />
        </div>
        <LegalFooter />
      </main>
    );
  }
  return (
    <main className="landing-page">
      <LandingNoirBackground />
      <header className="landing-header"><Brand /></header>
      <section className="login-shell">
        <div className="login-card">
          <h1>Compartilhe sua tela</h1>
          <p>Entre com o Discord para criar uma sala ou abrir um convite.</p>
          <form action={async () => { "use server"; await signIn("discord"); }}>
            <button className="button discord wide" type="submit"><DiscordMark /> Entrar com Discord <ArrowRight size={17} /></button>
          </form>
          <small className="login-note">Pedimos apenas sua identidade básica do Discord.</small>
        </div>
      </section>
      <LegalFooter />
    </main>
  );
}

function DiscordMark() {
  return <svg aria-hidden="true" width="19" height="15" viewBox="0 0 24 19" fill="currentColor"><path d="M20.3 1.7A18 18 0 0 0 15.8.3l-.6 1.2a16.6 16.6 0 0 0-6.4 0L8.2.3a18 18 0 0 0-4.5 1.4C.9 5.9.1 10 0 14.1a18.5 18.5 0 0 0 5.5 2.8l1.3-1.8c-.7-.3-1.4-.7-2-1.2l.5-.4c3.9 1.8 8.2 1.8 12.1 0l.6.4c-.7.5-1.4.9-2.1 1.2l1.3 1.8a18.4 18.4 0 0 0 5.5-2.8c-.2-4.8-1.7-8.9-2.4-12.4ZM7.6 11.6c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8.8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" /></svg>;
}
