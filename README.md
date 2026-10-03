# JanjaLive

Compartilhamento privado de tela para grupos recorrentes de amigos.

[Abrir JanjaLive](https://janja.live) · [Baixar para Windows](https://github.com/SCamposs/JanjaLive/releases/latest)

JanjaLive serve para abrir uma sala, escolher uma tela ou aplicação e compartilhar com amigos autorizados. As salas e seus membros continuam disponíveis para o próximo encontro, enquanto presença e transmissões são temporárias.

## O que ele faz

- salas privadas com entrada por convite ou aprovação;
- login com Discord;
- lista de salas para voltar sem digitar o código novamente;
- tela e áudio do sistema quando a fonte e o sistema oferecem suporte;
- resolução e FPS configuráveis;
- mais de um membro transmitindo, com escolha explícita do que assistir;
- clientes web e desktop usando as mesmas salas e permissões;
- nenhuma gravação e nenhuma lista pública de transmissões.

## Como usar

1. Entre com o Discord.
2. Crie uma sala ou abra uma sala já autorizada.
3. Convide seus amigos.
4. Escolha uma tela e comece a compartilhar.

## Privacidade

JanjaLive não grava sua transmissão. Somente a tela ou aplicação escolhida é capturada. A mídia é enviada por WebRTC para quem você decide atender; o servidor mantém identidade, salas, permissões e mensagens temporárias necessárias para conectar os participantes.

Leia a [Política de Privacidade](https://janja.live/privacidade), os [Termos de Uso](https://janja.live/termos) e o [inventário técnico de dados](docs/privacy-and-data.md).

## Aplicativo para Windows

O aplicativo oferece seletor próprio de telas e aplicações, áudio do sistema mais previsível, links de sala, atualização automática e acesso rápido às salas recorrentes.

O instalador atual ainda não possui assinatura Authenticode e pode aparecer como “Editor desconhecido”. A versão mais recente está em [GitHub Releases](https://github.com/SCamposs/JanjaLive/releases/latest). Não desative proteções do Windows para instalá-lo.

## Navegadores

O alvo principal do v0.1 é Windows com navegadores Chromium. Assistir, compartilhar e capturar áudio são capacidades diferentes; áudio depende do navegador, do sistema e da fonte escolhida. A matriz pública será adicionada somente após os testes manuais documentados — sem afirmar compatibilidade ainda não verificada.

## Contribuindo

Veja [CONTRIBUTING.md](CONTRIBUTING.md). Falhas de segurança devem seguir [SECURITY.md](SECURITY.md), nunca uma issue pública com dados sensíveis.

Documentação técnica: [arquitetura](docs/architecture.md), [desenvolvimento local](docs/local-development.md), [release desktop](docs/releasing.md), [dados e privacidade](docs/privacy-and-data.md), [segurança desktop](docs/desktop-security.md), [benchmark de produto](docs/product-benchmark.md) e [testes manuais WebRTC](docs/manual-webrtc-test.md).

## Licença

[MIT](LICENSE)
