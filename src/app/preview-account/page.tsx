import { AccountMenu } from "@/components/account-menu";
import { Brand } from "@/components/brand";
import { CreateRoomForm } from "@/components/create-room-form";

export default function PreviewAccountPage() {
  return (
    <main className="home-shell signed-in-home">
      <header className="landing-header">
        <Brand />
        <AccountMenu name="Ítalo" />
      </header>
      <div className="home-content">
        <section className="home-intro"><h1>Salas</h1><p>Crie uma sala ou entre com um código.</p></section>
        <CreateRoomForm />
      </div>
    </main>
  );
}
