import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacidade",
  description: "Como o JanjaLive trata dados e transmite mídia.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacidade" updatedAt="4 de outubro de 2026">
      <section>
        <h2>O que é tratado</h2>
        <p>Ao entrar com o Discord, o JanjaLive recebe o identificador da sua conta, nome, nome de exibição e avatar. O aplicativo não solicita seu e-mail e não guarda os tokens de acesso do Discord.</p>
        <p>Também são mantidos os dados necessários às salas: nome opcional, proprietário, membros autorizados, pedidos de entrada, convites protegidos, código e datas de atividade. Um cookie de sessão estritamente necessário mantém sua conta conectada.</p>
      </section>

      <section>
        <h2>Tela e áudio</h2>
        <p>A captura só começa após você escolher uma tela, janela, aplicação ou guia. No site, essa escolha acontece no seletor do navegador. No aplicativo para Windows, ela acontece no seletor do JanjaLive e vale uma única vez; compartilhar novamente exige uma nova escolha.</p>
        <p>O JanjaLive recebe somente a fonte selecionada e não solicita câmera, microfone, arquivos, leitura da área de transferência ou acesso geral ao computador. O aplicativo pode escrever um link de convite na área de transferência apenas quando o dono da sala pede.</p>
        <p>A mídia segue por WebRTC entre quem transmite e quem escolheu assistir. Quando o TURN opcional estiver configurado e uma conexão direta não for possível, os pacotes podem passar por essa retransmissão. JanjaLive não grava nem armazena imagem ou áudio. Pessoas autorizadas que assistem ainda podem gravar o conteúdo por meios próprios.</p>
      </section>

      <section>
        <h2>Dados temporários e prazos</h2>
        <p>Presença, anúncios de transmissão e mensagens de conexão ficam temporariamente no Upstash Redis e expiram em até 180 segundos. Essas mensagens podem incluir informações de rede necessárias ao WebRTC, mas não são copiadas para o banco principal nem exibidas na interface.</p>
        <p>A sessão do site expira em sete dias. No aplicativo para Windows, a sessão protegida pelo sistema operacional expira em até 30 dias e pode ser encerrada antes pela opção de sair da conta. Salas expiram após três dias sem atividade e são removidas definitivamente depois de mais 30 dias, desde que não haja ninguém presente. Dados de conta, autorização e pedidos de entrada permanecem enquanto necessários ao funcionamento ou até uma solicitação aplicável de exclusão.</p>
      </section>

      <section>
        <h2>Serviços envolvidos</h2>
        <p>Discord fornece a identidade; Vercel hospeda o aplicativo; Neon mantém o banco; Upstash mantém dados temporários; e Cloudflare pode atuar como retransmissor de mídia quando o TURN opcional estiver configurado. Cada provedor trata os dados técnicos necessários para prestar seu serviço conforme seus próprios termos.</p>
      </section>

      <section>
        <h2>Métricas de uso</h2>
        <p>O site usa Vercel Web Analytics para contar visualizações de páginas e produzir estatísticas agregadas, como país, navegador, sistema operacional, tipo de dispositivo e página visitada. Segundo a Vercel, esse recurso não usa cookies nem associa os eventos a uma identidade pessoal; o identificador diário é descartado após 24 horas.</p>
        <p>O JanjaLive não envia eventos personalizados. Parâmetros de URL, fragmentos, tokens de convite e identificadores de sala são removidos ou substituídos antes do envio. O Analytics não recebe conteúdo transmitido, nomes de usuários, códigos de sala ou mensagens de conexão.</p>
      </section>

      <section>
        <h2>Seus direitos</h2>
        <p>Você pode pedir confirmação do tratamento, acesso, correção ou exclusão dos seus dados quando aplicável, além de informações sobre compartilhamento. Como o JanjaLive é de acesso restrito, faça o pedido diretamente ao responsável que forneceu seu acesso ao serviço. Se esse canal mudar, esta página será atualizada.</p>
        <p>Informações gerais sobre os direitos previstos na LGPD estão disponíveis no <a href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados" rel="noreferrer">portal da ANPD</a>.</p>
      </section>
    </LegalPage>
  );
}
