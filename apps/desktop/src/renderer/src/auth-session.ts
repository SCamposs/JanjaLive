import type { AuthStatus, JanjaDesktopApi } from "../../shared/contracts";

export function subscribeAuthStatus(api: JanjaDesktopApi["auth"], listener: (status: AuthStatus) => void) {
  let active = true;
  let receivedStatus = false;
  const unsubscribe = api.onStatus((next) => {
    receivedStatus = true;
    if (active) listener(next);
  });
  void api.getStatus().then((next) => {
    if (active && !receivedStatus) listener(next);
  }).catch(() => {
    if (active && !receivedStatus) listener({ state: "error", message: "Não foi possível verificar sua sessão. Tente entrar novamente." });
  });
  return () => { active = false; unsubscribe(); };
}
