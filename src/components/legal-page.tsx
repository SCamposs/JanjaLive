import type { ReactNode } from "react";
import { Brand } from "./brand";
import { LegalFooter } from "./legal-footer";

export function LegalPage({ title, updatedAt, children }: { title: string; updatedAt: string; children: ReactNode }) {
  return (
    <main className="legal-shell">
      <header className="landing-header">
        <Brand />
      </header>
      <article className="legal-document">
        <header>
          <h1>{title}</h1>
          <p>Atualizado em {updatedAt}.</p>
        </header>
        {children}
      </article>
      <LegalFooter />
    </main>
  );
}
