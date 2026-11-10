import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacidade",
  description: "Como o JanjaLive trata dados e transmite mídia.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacidade" updatedAt="10 de novembro de 2026">
      <section>
        <h2>Sobre esta política</h2>
        <p>Esta política vale para o site e o aplicativo JanjaLive para Windows, incluindo a edição da Microsoft Store. Usamos dados para manter sua conta conectada, controlar o acesso às salas, conectar as transmissões e proteger o serviço contra abuso.</p>
      </section>
      <section>
        <h2>O que é tratado</h2>
        <p>Ao entrar com o Discord, o JanjaLive recebe o identificador da sua conta, nome, nome de exibição e avatar. O aplicativo não solicita seu e-mail e não guarda os tokens de acesso do Discord.</p>
        <p>Também são mantidos os dados necessários às salas: nome opcional, proprietário, membros autorizados, pedidos de entrada, convites protegidos, código e datas de atividade. Um cookie de sessão estritamente necessário mantém sua conta conectada.</p>
        <p>Também mantemos registros de segurança para aplicar limites de uso, encerrar sessões e revogar acessos às conexões. Esses registros não incluem o conteúdo transmitido.</p>
        <p>O responsável pelo serviço pode consultar contas e aplicar ou remover bloqueios. Essas ações mantêm um registro com a conta afetada, o responsável pela ação, a data e um motivo opcional. Esse registro não contém o conteúdo das transmissões nem um histórico de quem assistiu.</p>
      </section>

      <section>
        <h2>Tela e áudio</h2>
        <p>A captura só começa após você escolher uma tela, janela, aplicação ou guia. No site, essa escolha acontece no seletor do navegador. No aplicativo para Windows, ela acontece no seletor do JanjaLive e vale uma única vez; compartilhar novamente exige uma nova escolha.</p>
        <p>No aplicativo para Windows, nomes e miniaturas das telas e janelas disponíveis aparecem temporariamente no seletor para permitir a escolha. Eles não são armazenados nem enviados ao servidor. Somente a fonte escolhida se torna uma transmissão.</p>
        <p>Incluir áudio é opcional. No navegador, a disponibilidade depende do que você escolheu compartilhar e do suporte do navegador. No Windows, compartilhar uma aplicação inclui o áudio associado a ela. Ao compartilhar uma tela inteira, o áudio pode incluir sons de outras aplicações, inclusive conversas. Você pode escolher uma aplicação para excluir do áudio antes de começar.</p>
        <p>O JanjaLive não solicita câmera, microfone, seleção de arquivos ou leitura da área de transferência e não oferece controle remoto do computador. O aplicativo pode escrever um link de convite na área de transferência apenas quando o dono da sala pede.</p>
        <p>A transmissão conecta quem compartilha a quem escolheu assistir. Quando uma conexão direta não é possível e o recurso está disponível, um serviço de retransmissão pode encaminhar os dados. O JanjaLive não grava nem armazena imagem ou áudio. Quem assiste ainda pode gravar o conteúdo por meios próprios.</p>
        <p>Áudio e vídeo são criptografados em trânsito. Para conectar a transmissão, participantes e serviços de conexão podem receber endereços de rede, incluindo seu IP. Esses dados não aparecem na interface nem são intencionalmente registrados nos logs do JanjaLive. Os provedores de infraestrutura podem manter registros técnicos conforme suas próprias políticas.</p>
      </section>

      <section>
        <h2>Dados temporários e prazos</h2>
        <p>Informações de quem está online, transmissões disponíveis e mensagens para estabelecer conexões são coordenadas temporariamente pela Cloudflare. As mensagens de conexão podem incluir dados de rede; elas não são gravadas no banco principal nem exibidas na interface.</p>
        <p>A sessão do site expira em sete dias. No aplicativo para Windows, a sessão protegida pelo sistema operacional expira em até 30 dias. Você pode sair da conta antes desses prazos.</p>
        <p>Salas expiram após três dias sem atividade. A rotina de manutenção remove salas expiradas ou encerradas há mais de 30 dias, desde que não haja ninguém presente, junto com suas autorizações e pedidos de entrada.</p>
        <p>Os dados da conta não têm exclusão automática por inatividade. Sair da conta ou remover uma sala da sua lista não apaga esses dados. Eles permanecem cadastrados até uma exclusão aplicável. Registros de bloqueios e outras ações administrativas também não têm prazo automático de exclusão.</p>
        <p>Remover seu acesso a uma sala não exclui sua conta. Sair da conta encerra a sessão daquele dispositivo; “Sair de todos os dispositivos”, no menu do site, invalida sessões do site e do aplicativo. Registros temporários de autorização do serviço de retransmissão expiram em até uma hora e são removidos pela rotina de manutenção.</p>
      </section>

      <section>
        <h2>Serviços envolvidos</h2>
        <p>Discord fornece os dados de login; Vercel hospeda o site; Neon mantém os dados de contas e salas; e Cloudflare coordena as conexões e pode encaminhar transmissões quando o serviço de retransmissão estiver habilitado. Se a alternativa Upstash for ativada, ela assume a coordenação temporária das conexões. Cada provedor trata os dados necessários à sua função conforme suas próprias políticas.</p>
        <p>Na edição da Microsoft Store, a Microsoft também processa os dados necessários à aquisição, instalação e atualização do pacote conforme a política de privacidade dela. A conta Microsoft usada na loja não substitui o login com Discord no JanjaLive. Na edição obtida pelo site ou GitHub, arquivos de atualização são distribuídos pelo GitHub. Esses serviços de distribuição não recebem a transmissão de tela ou áudio por essa função.</p>
      </section>

      <section>
        <h2>Métricas de uso</h2>
        <p>O site usa Vercel Web Analytics para contar visualizações de páginas e produzir estatísticas agregadas, como país, navegador, sistema operacional, tipo de dispositivo e página visitada. Segundo a Vercel, esse recurso não usa cookies nem associa os eventos a uma identidade pessoal; o identificador diário é descartado após 24 horas.</p>
        <p>O JanjaLive não envia eventos personalizados. Parâmetros de URL, fragmentos, tokens de convite e identificadores de sala são removidos ou substituídos antes do envio. O Analytics não recebe conteúdo transmitido, nomes de usuários, códigos de sala ou mensagens de conexão.</p>
      </section>

      <section>
        <h2>Seus direitos</h2>
        <p>Você pode solicitar confirmação do tratamento, acesso, correção ou exclusão dos seus dados quando aplicável, além de informações sobre compartilhamento. O canal de atendimento ainda está em preparação. A disponibilidade será informada na página de <a href="/safety">privacidade e segurança</a>.</p>
        <p>Os controles de sair da conta e remover acesso a salas continuam disponíveis no aplicativo, mas não substituem um pedido de exclusão dos dados da conta.</p>
        <p>Informações gerais sobre os direitos previstos na LGPD estão disponíveis no <a href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados" rel="noreferrer">portal da ANPD</a>.</p>
      </section>
    </LegalPage>
  );
}
