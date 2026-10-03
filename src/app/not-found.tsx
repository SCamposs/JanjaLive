import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { NoirInterference } from "@/components/noir-interference";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <header className="landing-header"><Brand /></header>
      <section className="not-found-stage">
        <NoirInterference>
          <div className="not-found-copy">
            <span>404</span>
            <h1>Sala não encontrada</h1>
            <Link className="button secondary" href="/"><ArrowLeft size={16} /> Voltar ao início</Link>
          </div>
        </NoirInterference>
      </section>
    </main>
  );
}
