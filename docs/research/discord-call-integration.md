# Integração opcional com calls do Discord

Pesquisa em 16/11/2026. Proposta inicial de produto e arquitetura, relacionada à issue #17. Posteriormente foi validada uma prova com bot real e implementada uma beta local; o estado atualizado e as diferenças de escopo estão em `docs/adr/0002-discord-call-beta.md` e no roteiro de operações. Esta pesquisa inicial não é uma declaração de funcionalidade publicada.

## Recomendação

Começar com `/janja`, uma sala por sessão de canal de voz e um único cartão compartilhado no chat da call. Participantes autenticados têm a presença na call verificada na entrada. O bot facilita encontrar e acessar a sala; a seleção de fonte e o início da transmissão continuam no JanjaLive.

O MVP pode usar interações HTTP e consultas REST sob demanda, sem processo de bot permanentemente conectado ao Gateway. É a alternativa recomendada para preservar a arquitetura atual e buscar custo adicional zero. A viabilidade foi confirmada na documentação, mas permissões, prazos de resposta e consumo precisam de uma prova pequena antes da implementação completa.

## Capacidades confirmadas e seus limites

- `GET /guilds/{guild.id}/voice-states/{user.id}` informa o canal de voz atual de um usuário. O bot precisa ter permissão de conectar ao canal ocupado por ele. A consulta não exige entrar na call ou receber seu áudio. O `channel_id` da interação pode ser um canal de texto; consultar o estado de voz do autor é necessário. O `session_id` do estado é individual, não um identificador compartilhado da call. [Voice Resource](https://docs.discord.com/developers/resources/voice#get-user-voice-state).
- Comandos podem chegar por HTTP, com assinatura Ed25519 verificada sobre timestamp e corpo original. A resposta inicial precisa ocorrer em até 3 segundos; uma resposta adiada permite concluir o trabalho depois. Tokens de interação duram 15 minutos. Não usar esse token como credencial permanente para atualizar o cartão. [Interações](https://docs.discord.com/developers/interactions/receiving-and-responding).
- Comandos podem ser instalados no servidor e limitados a esse contexto. Não é preciso monitorar mensagens para responder a `/janja`. [Application Commands](https://docs.discord.com/developers/interactions/application-commands).
- Botões de link apenas navegam; a autorização deve acontecer no backend do JanjaLive após autenticar quem abriu o link. Usar aparência nativa dos botões do Discord, com identidade no avatar e no cartão. [Components](https://docs.discord.com/developers/components/reference).
- O navegador exige uma ação do usuário e consentimento para iniciar captura. Não prometer que abrir o link inicia compartilhamento, nem que o som começa automaticamente em todo navegador. [Screen Capture API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia#security).

O MVP não precisa enumerar toda a call: verifica cada pessoa quando ela tenta entrar. Também não acompanha continuamente quem saiu ou mudou de canal.

## Fluxo proposto

1. Um administrador instala a integração uma vez nos servidores e canais permitidos. Começar com um servidor de teste autorizado.
2. Uma pessoa na call executa `/janja`. A resposta privada mostra `Preparando sua sala…`; comandos simultâneos reutilizam a mesma sessão.
3. Se o autor já possui conta ativa vinculada ao Discord, o backend pode criar ou reutilizar a sala. No primeiro uso, `Continuar no JanjaLive` leva ao login e às regras da conta antes de provisionar a sala. O retorno preserva a intenção original.
4. Quando pronta, a integração publica um cartão no chat do canal de voz. O autor recebe um atalho privado para abrir o JanjaLive e escolher o que transmitir. Nenhuma captura começa sozinha.
5. Amigos clicam em `Entrar` ou `Assistir`, autenticam se necessário e têm sua presença naquele canal verificada pelo servidor. Sem copiar código e sem aprovação manual do dono para participantes elegíveis.
6. Outra pessoa que queira transmitir usa a mesma sala. O cartão é atualizado nos eventos relevantes, sem novas mensagens para cada entrada.

| Estado do cartão | Texto sugerido | Ação principal |
| --- | --- | --- |
| Sala pronta, sem transmissão | Sala da call pronta | Entrar |
| Uma transmissão | SCamposs está transmitindo | Assistir |
| Várias transmissões | 2 transmissões disponíveis | Entrar na sala |
| Sessão encerrada | Sessão encerrada | Sem botão de entrada ativo |

O cartão público deve ser uma mensagem normal do bot, editável depois com sua credencial de servidor. Não depender de um token de interação expirado. Validar o envio no chat de voz; se não permitido, explicar o problema em privado e oferecer somente um canal alternativo configurado pelo administrador.

Na abertura do link, oferecer `Abrir no aplicativo` e `Continuar no navegador`, preservando a sessão pretendida. Evitar download obrigatório ou redirecionamento repetido quando o aplicativo não está instalado. Um desktop antigo sem suporte deve oferecer o navegador. Se houver várias transmissões, o usuário escolhe; entrar na sala não deve assinar todas automaticamente.

## Política de acesso recomendada

**Quem está na call pode entrar. Quem entrou participa até sair da sala, ter o acesso revogado ou a sessão ser encerrada.**

Essa é uma escolha proposta para o MVP, não uma restrição imposta pelo Discord. Sair da call não causa expulsão imediata do JanjaLive. Isso evita oscilações em reconexões e dispensa acompanhamento contínuo. Uma nova entrada na sala exige nova verificação.

- O acesso deve valer para a sessão, sem transformar cada participante em membro permanente de uma sala comum.
- Revogações e banimentos do JanjaLive prevalecem sobre a presença na call. O bot não pode readmitir alguém revogado silenciosamente.
- Um link encaminhado não concede acesso: a identidade autenticada precisa estar no canal associado.
- Verificar o estado de voz depois do OAuth, mesmo se já consultado antes. Não confiar em guild, canal ou identidade informados pelo navegador.
- Aplicar a mesma política nas rotas normais de código, convite, API e emissão de credenciais de tempo real. Proteger só o link do bot permitiria contornar a restrição.
- Para expulsar automaticamente quem sai da call, seria necessário outro escopo: eventos do Gateway ou consultas periódicas, com tolerância a reconexão e mudanças de estado versionadas. Não incluir isso implicitamente.

## Sala, duração e limites

Chave lógica: servidor + canal de voz + sessão própria do JanjaLive. Garantir atomicamente uma sessão ativa por canal e deduplicar comandos por ID de interação. Um link antigo aponta apenas para sua sessão encerrada; não deve criar ou abrir outra automaticamente.

O primeiro criador elegível é o dono. Reutilizar a mesma sala para transmissores adicionais. Não conceder poder de dono a todo participante nem encerrar uma transmissão porque o criador saiu do Discord.

Propor encerramento explícito pelo dono e expiração após um intervalo curto sem participantes no JanjaLive, com tolerância a reconexão. A duração exata precisa de validação de UX; 10 minutos é uma hipótese inicial. Sem monitorar o Gateway, não afirmar que detectamos imediatamente o fim da call do Discord. Salas temporárias não devem poluir a listagem permanente depois de encerradas.

Preservar os limites atuais: 5 salas ativas por dono e 20 criações em 24 horas, além dos demais limites de participantes e conta. Reutilização não cria outra sala; excluir ou encerrar não deve liberar artificialmente a cota diária. Mostrar os motivos existentes quando a criação não for permitida.

## Encaixe na arquitetura atual

O Vercel continua responsável por autenticação, regras da conta e autorização persistente no PostgreSQL. O Worker/Durable Objects continua responsável por presença e sinalização. Áudio e vídeo continuam P2P, com a política atual de TURN; o bot não transporta nem codifica mídia.

Começar a prova com um endpoint HTTP pequeno no backend existente, verificando assinatura e respondendo de forma adiada antes de consultas de rede demoradas. Medir a margem para o prazo de 3 segundos, inclusive execução fria. Se não houver margem suficiente, avaliar uma entrada HTTP no Worker existente para assinatura e resposta rápida, sem migrar regras de autorização para lá. Não introduzir esse segundo caminho sem necessidade demonstrada.

A conclusão assíncrona exige deduplicação, registro de operação e recuperação limitada em falhas. Uma nova tentativa deve recuperar a mesma operação, nunca criar outra sala. `waitUntil()` não substitui entrega durável: no Worker, o trabalho posterior à resposta tem limite de 30 segundos. Validar também o mecanismo de execução pós-resposta no ambiente escolhido. Não habilitar filas ou planos pagos por conveniência. [Cloudflare Context](https://developers.cloudflare.com/workers/runtime-apis/context/).

Usar o vínculo Discord já existente no usuário (`discordId`) e manter o OAuth com `identify`. A integração usa o token do bot somente no servidor; não requer guardar tokens OAuth adicionais do usuário. Criar uma intenção curta vinculada ao autor para o primeiro login. Estender o retorno seguro de autenticação explicitamente, sem aceitar redirecionamentos arbitrários.

O acesso temporário requer um modelo explícito de autorização por sessão, integrado aos controles existentes de revogação. Não reaproveitar a associação permanente de membros sem distinguir os dois casos. Manter salas comuns e clientes sem integração funcionando como hoje.

## Permissões e proteção

| Necessidade | Permissão ou mecanismo |
| --- | --- |
| Instalar bot e comandos no servidor | Instalação de servidor com bot e comandos de aplicação |
| Consultar estado de voz no canal | Visibilidade e `CONNECT`, respeitando sobrescritas do canal |
| Publicar/editar o próprio cartão | `SEND_MESSAGES` e `EMBED_LINKS` no canal escolhido |
| Receber comandos | Endpoint HTTP com assinatura válida e contexto de servidor |

Não pedir `Administrator`, fala, gerenciamento de canais/mensagens ou intents privilegiadas de conteúdo, presença e membros para esse MVP. `CONNECT` é uma permissão real de conectar; explicar seu uso para consulta, sem fingir que é uma permissão exclusiva de leitura. O código não deve iniciar conexão de áudio. [Discord Permissions](https://docs.discord.com/developers/topics/permissions).

Aplicar limite por usuário/servidor/canal, lista inicial de servidores permitidos e flag para desligar a integração. Validar assinatura, atualidade do timestamp e repetição do ID; não usar apenas um segredo em URL. Não registrar tokens de interação, bot ou payloads completos com dados pessoais.

Guardar somente vínculo servidor/canal/sessão, responsáveis, prazo, mensagem e concessões necessárias. Não guardar áudio, estados de mute/deaf, dispositivo ou `session_id` de voz sem finalidade. Definir retenção/limpeza e atualizar privacidade antes de lançar. Desabilitar menções involuntárias e tratar nomes como texto não confiável.

Falhas do Discord bloqueiam novas admissões com opção de tentar novamente; não devem derrubar transmissões existentes. Desinstalação/desativação bloqueia novas operações, sem conceder acesso permanente como fallback. Não presumir que HTTP interações entrega notificações de todas as mudanças de instalação: validar a estratégia de detecção e reconciliação.

## Estados de erro úteis

| Situação | Resposta sugerida |
| --- | --- |
| Autor fora de uma call suportada | Entre em uma call deste servidor e tente novamente. |
| Bot sem acesso ao canal | O JanjaLive não tem acesso a esta call. Peça a um administrador para revisar as permissões. |
| Visitante em outro canal | Entre na call desta sala para continuar. |
| Sessão antiga | Esta sessão foi encerrada. Abra uma nova pelo Discord. |
| Discord temporariamente indisponível | Não foi possível verificar a call agora. Tente novamente. |
| Sala ou conta limitada | Reutilizar as mensagens específicas dos limites atuais. |

Não expor lista de membros ou nomes de canais privados a visitantes recusados. DMs, chamadas em grupo e Stage ficam fora do primeiro escopo.

## Custo e alternativas

A arquitetura proposta evita hospedagem permanente de Gateway, leitura contínua da call e sincronização por segundo. O consumo acompanha comandos, entradas e eventos de transmissão. Continua existindo consumo adicional de requisições, banco e limites REST; custo zero depende da folga dos planos atuais e de medir o fluxo real.

Workers Free tem limite de 100 mil requisições diárias por conta e 10 ms de CPU por requisição. Isso é compartilhado com o uso existente; consultas Discord não equivalem diretamente a esse contador e Durable Objects possui sua própria medição. Não prometer gratuidade ilimitada nem ativar upgrade automático. [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/), [Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

| Alternativa | Avaliação |
| --- | --- |
| Comando HTTP + REST na entrada | Recomendada: resolve acesso rápido com escopo pequeno e sem processo permanente. |
| Bot com Gateway e sincronização contínua | Só se expulsão ao sair da call for requisito; adiciona conexão, reconexão e estado. |
| Discord Activity | Roda em iframe com Embedded App SDK; exige outra adaptação de cliente e validação de captura/rede. Pesquisa futura, sem assumir que o desktop atual pode ser embutido. |
| Bot entrar na call e transmitir mídia | Fora da proposta: cria outro caminho de áudio/vídeo e não resolve apenas o acesso ao JanjaLive. |

[Activities Overview](https://docs.discord.com/developers/activities/overview) confirma o modelo embarcado; não demonstra compatibilidade com nossa captura atual.

## Prova mínima antes de aprovar implementação completa

- Servidor privado de teste: lookup REST em canais públicos, privados, cheios e com permissão negada, sem entrar em áudio.
- Comando em canal de texto resolve a call verdadeira; fora da call, DM e Stage são tratados corretamente.
- Medir resposta inicial fria/quente, conclusão e consumo; validar assinatura inválida, PING e replay.
- Duas pessoas/comandos simultâneos geram uma sessão; repetição, falha parcial e retry não duplicam sala/cartão.
- Login novo, conta existente, banimento, revogação, link encaminhado e todos os caminhos alternativos de entrada.
- Web, desktop e celular preservam destino e escolha explícita de captura; desktop antigo oferece fallback seguro.
- Cartão continua editável depois de 15 minutos; rate limit, permissões removidas e bot desinstalado têm recuperação definida.
- Saída/reentrada, prazo de sessão, reconexão e expiração não deixam acesso permanente ou expulsões oscilantes.
- Comparar consumo e fluxo de mídia com integração desligada/ligada. Ausência de mudanças no caminho de mídia reduz risco, mas não substitui validação de regressão.

Só avançar se a prova confirmar a política de acesso, o prazo de resposta e a operação dentro da folga gratuita. Esta pesquisa não demonstra execução real, compatibilidade completa ou impacto zero.
