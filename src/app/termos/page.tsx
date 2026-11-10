import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { ROOM_CREATION_LIMITS } from "@janjalive/realtime-protocol";

export const metadata: Metadata = {
  title: "Termos de uso",
  description: "Condições simples para usar o JanjaLive.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Termos de uso" updatedAt="10 de novembro de 2026">
      <section>
        <h2>Uso do serviço</h2>
        <p>O JanjaLive permite compartilhar tela e áudio em salas com pessoas escolhidas. O serviço é gratuito e exige uma conta do Discord. Cuide do acesso à sua conta e respeite as regras da sala.</p>
        <p>Nas salas com aprovação, o proprietário aceita cada pedido de entrada. Nas salas por convite, quem tiver um convite válido pode entrar após fazer login. Compartilhe convites apenas com quem você deseja autorizar.</p>
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
        <p>Cada conta pode manter até {ROOM_CREATION_LIMITS.activeRoomsPerOwner} salas próprias ativas e criar até {ROOM_CREATION_LIMITS.roomCreationsPerDay} salas por período de 24 horas. Excluir uma sala libera espaço entre as salas ativas, mas não reduz o total de criações daquele período. Participar de salas de outras pessoas não ocupa esse limite de salas próprias.</p>
        <p>Salas expiram após três dias sem atividade. O proprietário pode excluir uma sala para encerrar o acesso de todos ou remover membros individualmente. Um participante pode remover o próprio acesso pela lista de salas; para voltar, precisará entrar novamente conforme o modo de acesso da sala.</p>
        <p>Sair de uma sala durante o uso não remove sua autorização. Sair da conta encerra a sessão naquele dispositivo; a opção “Sair de todos os dispositivos” encerra as demais sessões do JanjaLive. Nenhuma dessas ações exclui sua conta ou seus dados do Discord.</p>
        <p>Podemos limitar ou suspender o acesso para conter abuso, proteger pessoas e manter o serviço funcionando. Os limites de uso podem mudar; as condições atualizadas serão informadas no aplicativo e nestes termos.</p>
      </section>

      <section>
        <h2>Privacidade e alterações</h2>
        <p>O tratamento de dados está descrito na página de <Link href="/privacidade">Privacidade</Link>. Se o funcionamento do JanjaLive mudar de forma relevante, estes termos e a data acima também serão atualizados.</p>
      </section>
    </LegalPage>
  );
}
