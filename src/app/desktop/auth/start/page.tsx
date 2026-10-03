import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth, signIn } from "@/auth";
import { Brand } from "@/components/brand";
import { LegalFooter } from "@/components/legal-footer";
import { createDesktopAuthGrant } from "@/lib/desktop-auth";
import { DesktopAuthComplete } from "./desktop-auth-complete";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Conectar aplicativo", robots: { index: false, follow: false } };

const paramsSchema = z.object({
  state: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict();

export default async function DesktopAuthStartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parsed = paramsSchema.safeParse(await searchParams);
  if (!parsed.success) redirect("/");

  const session = await auth();
  const redirectTo = `/desktop/auth/start?${new URLSearchParams(parsed.data).toString()}`;

  if (!session?.user?.id) {
    return (
      <main className="legal-shell desktop-auth-shell">
        <header className="landing-header"><Brand /></header>
        <section className="legal-card desktop-auth-card">
          <h1>Entrar no JanjaLive</h1>
          <p>Use sua conta do Discord para continuar.</p>
          <form action={async () => { "use server"; await signIn("discord", { redirectTo }); }}>
            <button className="button discord wide" type="submit">Entrar com Discord</button>
          </form>
        </section>
        <LegalFooter />
      </main>
    );
  }

  const code = await createDesktopAuthGrant({
    userId: session.user.id,
    state: parsed.data.state,
    codeChallenge: parsed.data.challenge,
  });
  const deepLink = `janjalive://auth/callback?${new URLSearchParams({ code, state: parsed.data.state }).toString()}`;

  return (
    <main className="legal-shell desktop-auth-shell">
      <header className="landing-header"><Brand /></header>
      <section className="legal-card desktop-auth-card">
        <h1>Conta conectada</h1>
        <p>Você já pode voltar ao JanjaLive.</p>
        <DesktopAuthComplete deepLink={deepLink} />
      </section>
      <LegalFooter />
    </main>
  );
}
