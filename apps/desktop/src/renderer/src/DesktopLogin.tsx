import type { AuthStatus } from "../../shared/contracts";
import { DesktopNoirBackdrop } from "./DesktopNoirBackdrop";

export function DesktopLogin({ auth }: { auth: AuthStatus }) {
  const checking = auth.state === "checking";
  return <section className="desktop-login desktop-noir-screen" aria-busy={checking}>
    <DesktopNoirBackdrop />
    <img src="/janja-live.png" alt="" />
    <h1>JanjaLive</h1>
    <p>{checking ? "" : "Entre para abrir suas salas."}</p>
    <div className="desktop-login-action">
      {checking ? <div className="auth-checking" role="status"><span className="auth-checking-mark" aria-hidden="true" /><span>Preparando sua sessão…</span></div>
        : auth.state === "connecting" ? <div className="login-actions"><span>Aguardando o navegador…</span><button className="quiet-button" type="button" onClick={() => void window.janja.auth.cancel()}>Cancelar</button></div>
          : <button className="primary-button" type="button" onClick={() => void window.janja.auth.start()}>{auth.state === "error" ? "Tentar novamente" : "Entrar com Discord"}</button>}
    </div>
  </section>;
}
