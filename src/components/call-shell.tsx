import Link from "next/link";
import { Brand } from "./brand";

export function CallShell({ children }: { children: React.ReactNode }) {
  return <main className="home-shell"><header className="landing-header"><Brand /></header>
    <section className="login-shell"><div className="login-card">{children}</div></section></main>;
}

export function CallNotice({ message }: { message: string }) {
  return <CallShell><h1>Não foi possível entrar</h1><p role="status">{message}</p>
    <Link className="button secondary" href="/">Voltar ao início</Link></CallShell>;
}
