import Link from "next/link";
import { Brand } from "@/components/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacidade e segurança | JanjaLive" };

export default function SafetyPage() {
  const configuredContact = process.env.SECURITY_CONTACT_EMAIL?.trim();
  const contact = configuredContact && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(configuredContact) ? configuredContact : null;
  return <main className="home-shell">
    <header className="landing-header"><Brand /><Link className="button secondary compact" href="/">Voltar</Link></header>
    <section className="safety-content">
      <h1>Privacidade e segurança</h1>
      <h2>Compartilhe com quem você conhece</h2>
      <p>O convite permite localizar a sala. Use a entrada com aprovação para escolher quem terá acesso. Você pode remover membros e gerar um novo convite nas configurações da sala.</p>
      <p>Durante o compartilhamento, o JanjaLive mostra quem está recebendo sua transmissão. Pessoas autorizadas ainda podem gravar a tela com outros programas ou dispositivos.</p>
      <h2>Conexão e dados</h2>
      <p>Áudio e vídeo são criptografados em trânsito. O aplicativo não grava a transmissão. Conexões diretas podem revelar seu endereço de rede aos participantes e à infraestrutura de conexão.</p>
      <p>Guardamos sua identidade básica do Discord, sessões e permissões de sala. Identificadores temporários do serviço de conexão são mantidos até expirar para permitir a revogação de acesso. Não guardamos a senha do Discord.</p>
      <h2>Proteger sua conta</h2>
      <p>Se desconfiar de acesso indevido, use “Sair de todos os dispositivos” no menu da conta, depois proteja sua conta Discord. Compartilhamentos ativos nos clientes oficiais serão encerrados ao receber a revogação.</p>
      <h2>Denúncia e pedidos sobre seus dados</h2>
      <p>Para relatar abuso ou pedir a exclusão dos seus dados, informe seu identificador de conta e uma descrição curta. Não envie senhas, tokens, convites, endereços de rede ou capturas de transmissões privadas.</p>
      {contact ? <a className="button secondary" href={`mailto:${encodeURIComponent(contact)}?subject=${encodeURIComponent("JanjaLive: segurança, abuso ou privacidade")}`}>Entrar em contato</a>
        : <p>O canal de atendimento está sendo preparado. Enquanto isso, saia da sala e revogue o acesso de pessoas que você não reconhece.</p>}
      <p>Falhas técnicas de segurança também podem ser relatadas pelo <a href="https://github.com/SCamposs/JanjaLive/security/advisories/new" target="_blank" rel="noopener noreferrer">canal privado de vulnerabilidades</a>. Evite publicar dados de usuários em issues públicas.</p>
    </section>
  </main>;
}
