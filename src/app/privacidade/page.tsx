import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacidade",
  description: "Como o JanjaLive trata dados e transmite mídia.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacidade" updatedAt="1 de novembro de 2026">
      <section>
        <h2>Sobre esta política</h2>
        <p>Esta política descreve o tratamento de dados no site JanjaLive e no aplicativo para Windows, incluindo a edição distribuída pela Microsoft Store. Os dados são usados para identificar participantes, manter sessões e permissões de sala, estabelecer as transmissões escolhidas pelos usuários e proteger o serviço contra abuso.</p>
      </section>
      <section>
        <h2>O que é tratado</h2>
        <p>Ao entrar com o Discord, o JanjaLive recebe o identificador da sua conta, nome, nome de exibição e avatar. O aplicativo não solicita seu e-mail e não guarda os tokens de acesso do Discord.</p>
        <p>Também são mantidos os dados necessários às salas: nome opcional, proprietário, membros autorizados, pedidos de entrada, convites protegidos, código e datas de atividade. Um cookie de sessão estritamente necessário mantém sua conta conectada.</p>
        <p>Para conter abuso, mantemos um contador de criação de salas por conta. Para encerrar acessos, mantemos a data de revogação de sessões e identificadores temporários das credenciais TURN, sem a senha dessas credenciais.</p>
        <p>O responsável pelo serviço pode consultar contas e aplicar ou remover bloqueios. Essas ações mantêm um registro com a conta afetada, o responsável pela ação, a data e um motivo opcional. Esse registro não contém o conteúdo das transmissões nem um histórico de quem assistiu.</p>
      </section>

      <section>
        <h2>Tela e áudio</h2>
        <p>A captura só começa após você escolher uma tela, janela, aplicação ou guia. No site, essa escolha acontece no seletor do navegador. No aplicativo para Windows, ela acontece no seletor do JanjaLive e vale uma única vez; compartilhar novamente exige uma nova escolha.</p>
        <p>No aplicativo para Windows, nomes e miniaturas das telas e janelas disponíveis aparecem temporariamente no seletor para permitir a escolha. Eles não são armazenados nem enviados ao servidor. Somente a fonte escolhida se torna uma transmissão.</p>
        <p>Incluir áudio é opcional. No navegador, a disponibilidade depende da fonte escolhida e do suporte do navegador. No Windows, o áudio de uma aplicação é capturado dos processos associados à janela escolhida; ao compartilhar um monitor com áudio, é capturada a mistura de sons do sistema, que pode incluir sons de outras aplicações.</p>
        <p>O JanjaLive não solicita câmera, microfone, seleção de arquivos ou leitura da área de transferência e não oferece controle remoto do computador. O aplicativo pode escrever um link de convite na área de transferência apenas quando o dono da sala pede.</p>
        <p>A mídia segue por WebRTC entre quem transmite e quem escolheu assistir. Quando o TURN opcional estiver configurado e uma conexão direta não for possível, os pacotes podem passar por essa retransmissão. JanjaLive não grava nem armazena imagem ou áudio. Pessoas autorizadas que assistem ainda podem gravar o conteúdo por meios próprios.</p>
        <p>Áudio e vídeo são criptografados em trânsito. Para estabelecer a conexão, participantes e provedores de STUN/TURN podem receber endereços de rede, incluindo seu IP. Esses dados não são exibidos na interface do JanjaLive nem intencionalmente registrados nos logs da aplicação. A infraestrutura dos provedores pode manter registros técnicos conforme suas próprias políticas.</p>
      </section>

      <section>
        <h2>Dados temporários e prazos</h2>
        <p>Presença, anúncios de transmissão e mensagens de conexão são coordenados temporariamente pela Cloudflare. Essas mensagens podem incluir informações de rede necessárias ao WebRTC, mas não são gravadas no banco principal nem exibidas na interface.</p>
        <p>A sessão do site expira em sete dias. No aplicativo para Windows, a sessão protegida pelo sistema operacional expira em até 30 dias e pode ser encerrada antes pela opção de sair da conta. Salas expiram após três dias sem atividade e são removidas definitivamente depois de mais 30 dias, desde que não haja ninguém presente. Dados de conta, autorização e pedidos de entrada permanecem enquanto necessários ao funcionamento ou até uma solicitação aplicável de exclusão.</p>
        <p>A opção “Sair de todos os dispositivos”, no menu do site, invalida sessões web e desktop. Identificadores de credenciais TURN expiram em até uma hora e são removidos pela rotina de manutenção após expirar; também permitem tentar revogar o acesso em caso de banimento ou encerramento de sessões.</p>
      </section>

      <section>
        <h2>Serviços envolvidos</h2>
        <p>Discord fornece a identidade; Vercel hospeda o aplicativo; Neon mantém o banco; e Cloudflare coordena temporariamente as conexões e pode retransmitir mídia quando o TURN opcional estiver configurado. Upstash permanece disponível apenas como alternativa técnica de retorno. Cada provedor trata os dados técnicos necessários para prestar seu serviço conforme seus próprios termos.</p>
        <p>Na edição da Microsoft Store, a Microsoft também processa os dados necessários à aquisição, instalação e atualização do pacote conforme a política de privacidade dela. A conta Microsoft usada na loja não substitui o login com Discord no JanjaLive. Na edição obtida pelo site ou GitHub, arquivos de atualização são distribuídos pelo GitHub. Esses serviços de distribuição não recebem a transmissão de tela ou áudio por essa função.</p>
      </section>

      <section>
        <h2>Métricas de uso</h2>
        <p>O site usa Vercel Web Analytics para contar visualizações de páginas e produzir estatísticas agregadas, como país, navegador, sistema operacional, tipo de dispositivo e página visitada. Segundo a Vercel, esse recurso não usa cookies nem associa os eventos a uma identidade pessoal; o identificador diário é descartado após 24 horas.</p>
        <p>O JanjaLive não envia eventos personalizados. Parâmetros de URL, fragmentos, tokens de convite e identificadores de sala são removidos ou substituídos antes do envio. O Analytics não recebe conteúdo transmitido, nomes de usuários, códigos de sala ou mensagens de conexão.</p>
      </section>

      <section>
        <h2>Seus direitos</h2>
        <p>Você pode pedir confirmação do tratamento, acesso, correção ou exclusão dos seus dados quando aplicável, além de informações sobre compartilhamento. Consulte o <a href="/safety">canal de privacidade e denúncia</a> para entrar em contato com o responsável.</p>
        <p>Informações gerais sobre os direitos previstos na LGPD estão disponíveis no <a href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados" rel="noreferrer">portal da ANPD</a>.</p>
      </section>
    </LegalPage>
  );
}
