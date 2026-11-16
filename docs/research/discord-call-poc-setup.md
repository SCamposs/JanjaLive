# Teste privado do bot: configuração e roteiro

16/11/2026. Prova isolada em `tools/discord-call-poc`, usando apenas módulos nativos do Node 22. Não importa código do app, não acessa o banco, não cria salas e não inicia captura. Não usa as credenciais OAuth atuais do JanjaLive.

## O que configurar no Discord

1. Abra [Developer Portal](https://discord.com/developers/applications) → **New Application**, nome `JanjaLive Teste`. Use uma aplicação separada da que faz login no JanjaLive.
2. **General Information**: copie **Application ID** e **Public Key**.
3. **Bot**: gere/copiei o **Token** por **Reset Token**, se necessário. Deixe **Requires OAuth2 Code Grant** e todos os **Privileged Gateway Intents** desligados. Não é necessário conectar o bot ao Gateway; ele pode aparecer offline na lista e ainda responder por HTTP.
4. **Installation**: habilite apenas **Guild Install**, desabilitando **User Install**. Em **Discord Provided Link / Default Install Settings**, escolha os scopes `bot` e `applications.commands`. Marque somente **View Channels**, **Send Messages**, **Embed Links** e **Connect**. Não marque Administrator, Speak ou permissões de gerenciar canais/mensagens.
5. Copie o **Install Link**, abra-o autenticado na sua conta e instale somente no servidor privado. A prova também rejeita requisições de outros servidores e usuários não autorizados. Não cadastre a aplicação no App Directory.
6. No Discord, **Configurações do usuário → Avançado → Modo desenvolvedor**. Clique com o botão direito no servidor → **Copiar ID do servidor**; no seu perfil → **Copiar ID do usuário**.
7. Crie dois canais de voz comuns: `teste-janja` e `outra-call`. No primeiro, permita ao cargo do bot **Ver canal**, **Conectar**, **Enviar mensagens** e **Inserir links**, incluindo eventuais sobrescritas de categoria. O dono ter acesso não significa que o bot também tenha.

O **Public Bot** não precisa ser habilitado para terceiros. Se optar por desabilitá-lo e o Portal recusar o link padrão de instalação, mude **Installation → Install Link** para **None** e use **OAuth2 → URL Generator**, scopes `bot`/`applications.commands`, com as mesmas quatro permissões. Instale pelo link gerado usando a conta dona da aplicação. Não configure Redirect URI nem Client Secret para esta prova.

Os passos de instalação seguem a [documentação oficial](https://docs.discord.com/developers/quick-start/getting-started). A permissão **Connect** é necessária para [consultar o estado de voz](https://docs.discord.com/developers/resources/voice#get-user-voice-state), mas nosso código não conecta o bot ao áudio.

## Arquivo local

Arquivo já preparado, ignorado pelo Git:

`C:\Users\zuado\code\pessoal\janja-live\.tooling\discord-call-poc\.env`

```dotenv
DISCORD_APPLICATION_ID=Application ID
DISCORD_PUBLIC_KEY=Public Key
DISCORD_BOT_TOKEN=Token da página Bot
DISCORD_TEST_GUILD_ID=ID do servidor privado
DISCORD_TEST_USER_IDS=Seu ID de usuário
```

Cole o token diretamente no arquivo local; não envie no chat, screenshot, issue ou comando de terminal. **Public Key é diferente de Client Secret.** Se o token vazar, faça Reset Token e substitua o valor local. Nenhum desses valores vai para a Vercel ou para o Worker de produção.

Para incluir uma segunda conta depois, adicione seu ID em `DISCORD_TEST_USER_IDS`, separado por vírgula, e reinicie apenas a prova. O comando começa restrito a administradores; para uma segunda conta sem esse papel, autorize especificamente `/janja-teste` em **Configurações do servidor → Integrações → JanjaLive Teste**, sem torná-la administradora.

## O que o agente executará após a configuração

Na raiz do repositório:

```powershell
node --env-file=.tooling/discord-call-poc/.env tools/discord-call-poc/commands.mjs register
node --env-file=.tooling/discord-call-poc/.env tools/discord-call-poc/server.mjs
```

O registro cria/atualiza somente `/janja-teste` neste servidor, sem substituir outros comandos. O servidor escuta somente `127.0.0.1:8789`.

Um [Quick Tunnel gratuito](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) fornecerá HTTPS temporário:

```powershell
.\.tooling\discord-call-poc\cloudflared.exe tunnel --url http://127.0.0.1:8789
```

O executável portátil pode ser obtido da [release oficial do cloudflared](https://github.com/cloudflare/cloudflared/releases/latest); não instalar como serviço. Não usar login por email/Access no túnel, pois o Discord precisa enviar POST diretamente. O endpoint exige assinatura válida do Discord e não expõe arquivos locais.

O agente fornecerá a URL completa. Em **General Information → Interactions Endpoint URL**, cole:

`https://ENDERECO-TEMPORARIO.trycloudflare.com/interactions`

Clique **Save Changes**. O Discord fará o PING assinado de validação. Se não salvar, registrar o erro e corrigir antes dos comandos. O túnel é temporário: ao reiniciá-lo, é preciso substituir a URL. Não preencher Event Webhooks URL no lugar de Interactions Endpoint URL.

Nenhum plano pago, domínio, deploy, alteração de DNS ou servidor permanente é necessário. São chamadas limitadas à API Discord e um processo local temporário; não é uma medição do custo de uma integração futura em produção.

## Roteiro do teste real

1. Fora de uma call, execute `/janja-teste` em um canal de texto: deve pedir para entrar na call, em resposta privada.
2. Entre em `teste-janja` e execute o comando no canal de texto: deve identificar a call correta, não o canal de texto. Confirme que o bot não entrou no áudio.
3. Execute `/janja-teste acao: Criar ou atualizar cartão de teste`. Deve publicar um cartão no **chat da call**.
4. Clique **Verificar acesso**: deve confirmar presença. A confirmação é só da prova; não cria uma concessão de acesso real no JanjaLive.
5. Mude para `outra-call` e clique no cartão antigo: deve recusar. Desconecte da voz e tente novamente: também deve recusar.
6. Volte, repita a criação: deve atualizar o mesmo cartão. Com uma segunda conta autorizada, testar duas solicitações simultâneas.
7. Aguarde mais de 15 minutos **sem reiniciar o servidor local**, execute novamente a ação de cartão e confirme que a edição pelo token do bot continua funcionando. Não usar o botão como única evidência desse teste, pois o clique gera um novo token de interação.
8. No canal de teste, negue **Connect** ao cargo do bot, mantendo o acesso do usuário: a consulta deve falhar com mensagem de permissão. Restaure a permissão. Repetir negando envio de mensagens para distinguir consulta e publicação.
9. Execute `/janja-teste acao: Encerrar meu cartão de teste`: deve editar o cartão e desativar seu botão. Somente seu criador pode encerrar pela prova.

O servidor registra apenas tempos e categorias de resultado, sem tokens, payloads ou lista de membros. Registrar os tempos de ACK e de conclusão em várias chamadas, incluindo a primeira; o teste local não demonstra latência de uma futura função hospedada.

## Limites intencionais

- Sessões, deduplicação e cartões são associados em memória. Reiniciar o processo invalida botões antigos e perde o vínculo de atualização; apague manualmente cartões antigos antes de outra rodada.
- Não há retry automático de envio: um timeout ambíguo pode ter publicado a mensagem. Conferir o chat antes de tentar novamente. Durabilidade e reconciliação são requisitos de uma implementação futura, não uma propriedade já demonstrada.
- A prova verifica identidade assinada pelo Discord e presença em voz. Não valida OAuth do JanjaLive, retorno para o desktop, autorização temporária real, banco, cotas de sala ou mídia.
- Testes locais usam respostas simuladas da API e HTTP real em loopback; só a rodada com credenciais próprias confirma comportamento do Discord.
- Não alterar a conta/bot OAuth atual, adicionar intents ou aumentar permissões para contornar um teste sem entender a falha.

## Desmontar o teste

Encerrar os cartões, remover o comando e parar servidor/túnel:

```powershell
node --env-file=.tooling/discord-call-poc/.env tools/discord-call-poc/commands.mjs remove
```

Apagar o **Interactions Endpoint URL** da aplicação de teste e, se não quiser manter o bot, removê-lo do servidor. O comando remove apenas `/janja-teste`; não usa substituição em lote. Os arquivos e credenciais locais não entram em release alguma.

## Validação registrada

Código preparado; 13 testes automatizados passaram em 16/11/2026 com `node --test tools/discord-call-poc/core.test.mjs`. Cobrem assinatura/corpo/timestamp, ACK antecipado, PING HTTP, restrições de identidade/servidor, estado de voz, mudança de canal, erros 403/429, deduplicação e cartão único/encerramento. ESLint direcionado passou.

A autenticação do bot separado foi verificada por uma consulta real somente de leitura a `/users/@me`: HTTP 200, conta marcada como bot e ID correspondente à aplicação informada. O `cloudflared` portátil oficial 2026.11.0 foi preparado localmente com hash conferido contra o digest da release.

### Rodada real no Discord — 16/11/2026

Aplicação separada instalada no servidor privado, comando de servidor registrado e endpoint temporário validado pelo Portal. O usuário confirmou com screenshots:

- Comando enviado em texto identificou `teste-janja` como a call atual.
- Cartão publicado no chat do canal de voz.
- Clique na call correta aprovou a verificação, sem conceder acesso real ao JanjaLive.
- Clique após mudar para `outra-call` recusou e pediu a call do cartão.
- Clique após desconectar da voz recusou e pediu para entrar em uma call.
- Repetir a ação de cartão retornou confirmação de atualização do mesmo cartão, sem criar outro.
- A ação de encerramento retornou confirmação. O screenshot mostra a resposta privada de sucesso; não mostra o estado visual final do botão no cartão.
- Negar Connect ao bot no canal, mantendo o usuário na call, recusou a consulta com mensagem de falta de acesso. Restaurar Connect voltou a identificar a call, confirmado por screenshots às 12:56.
- Na rodada de Send Messages negado, o usuário confirmou a execução do roteiro. Os screenshots às 12:59 mostram a recusa da publicação e o sucesso após restaurar a permissão, incluindo o cartão no chat. A consulta isolada durante a negação não aparece nesses screenshots; não confundir essa etapa com comprovação visual independente.

O log da rodada registrou seis respostas iniciais em 1,06–1,43 ms dentro do processo local e cinco conclusões em 390–2146 ms antes da edição da resposta privada. São tempos do servidor, não latência ponta a ponta nem medição de função hospedada. Nenhuma amostra de criação fria em Vercel/Worker foi obtida.

- Edição após 15 minutos confirmada: screenshot mostra o cartão original de 12:59 marcado como editado e resposta privada às 13:21 informando atualização do mesmo cartão. Intervalo observado de aproximadamente 22 minutos, sem nova publicação. Confirma o uso da rota de mensagem com token do bot; não significa que o token de interação original continua válido.

O screenshot final às 13:23 confirmou o cartão com título de teste encerrado e botão desativado. A concorrência entre duas contas no Discord real não foi executada; a prova local cobriu o caso simulado, e a implementação beta acrescentou testes concorrentes com PostgreSQL real. OAuth/admissão real do JanjaLive e infraestrutura de produção ficaram fora desta prova. A implementação posterior está descrita em `docs/adr/0002-discord-call-beta.md`.
