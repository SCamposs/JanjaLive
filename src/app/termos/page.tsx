import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Termos de uso",
  description: "Condições simples para usar o JanjaLive.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Termos de uso" updatedAt="2 de outubro de 2026">
      <section>
        <h2>Uso do serviço</h2>
        <p>JanjaLive permite criar salas privadas, autorizar participantes e compartilhar uma tela com pessoas escolhidas. Para usar o serviço, é necessário entrar com uma conta do Discord e respeitar as regras da sala.</p>
      </section>

      <section>
        <h2>Responsabilidade pelo conteúdo</h2>
        <p>Compartilhe somente conteúdo que você tem direito e autorização para mostrar. Não use o JanjaLive para expor dados pessoais de terceiros, praticar fraude, assédio, abuso, violar direitos autorais ou realizar atividades ilegais.</p>
        <p>Quem cria a sala controla aprovações e remoções. Uma autorização de entrada não dá permissão para copiar, gravar ou redistribuir o conteúdo compartilhado.</p>
      </section>

      <section>
        <h2>Funcionamento e disponibilidade</h2>
        <p>O compartilhamento depende do navegador, sistema operacional, conexão dos participantes e serviços externos. A transmissão pode falhar, reconectar ou não oferecer áudio para determinada fonte. O serviço não promete disponibilidade contínua nem impede que um participante autorizado grave a tela por outro meio.</p>
      </section>

      <section>
        <h2>Salas e contas</h2>
        <p>Salas inativas expiram após três dias. O proprietário pode fechar uma sala e remover membros a qualquer momento. O acesso ao serviço pode ser interrompido para proteger pessoas, dados ou a infraestrutura, ou em caso de uso incompatível com estes termos.</p>
        <p>Sair da conta encerra a sessão no JanjaLive, mas não desvincula nem exclui sua conta do Discord.</p>
      </section>

      <section>
        <h2>Privacidade e alterações</h2>
        <p>O tratamento de dados está descrito na página de <Link href="/privacidade">Privacidade</Link>. Se o funcionamento do JanjaLive mudar de forma relevante, estes termos e a data acima também serão atualizados.</p>
      </section>
    </LegalPage>
  );
}
