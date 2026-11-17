# Ativação e validação da integração Discord

O fluxo da beta de 16/11/2026 foi exercitado com duas contas no servidor de teste. A expansão preparada em 17/11/2026 usa instalação privada e lista de bloqueio pelo admin, sem aprovação por servidor. A [ADR 0003](../adr/0003-discord-guild-controls.md) descreve a política nova; os passos abaixo são para sua ativação, não uma afirmação de que o rollout já ocorreu.

## Expiração por inatividade

A sala da call não tem mais um teto fixo de seis horas. Fica ativa enquanto existir ao menos uma conexão na sala do JanjaLive. Quando a última fecha, começa **uma hora de inatividade**; voltar antes disso cancela o prazo. Sair apenas da call do Discord não inicia esse prazo se o JanjaLive continua conectado. Uma sala criada e nunca aberta também vence em uma hora. Repetir `/janja` ou consultar a página não renova uma sala vazia.

O relógio fica no Durable Object já existente, com armazenamento e alarme pontual. Não há processo local, job novo ou polling periódico. Ao vencer, o acesso é bloqueado imediatamente no Worker; banco e cartão são reconciliados na próxima consulta existente. A detecção de uma queda abrupta depende do fechamento do WebSocket. O vencimento não apaga fisicamente todos os registros nesse instante.

Ordem de rollout: publicar o Worker compatível com credenciais antigas e com a nova política; depois publicar a web/backend. Salas comuns mantêm a política atual. Salas Discord existentes são migradas ao consultar listagem/entrada/reutilização. Não reduzir o prazo em produção para testar: os limites de uma hora e permanência acima de seis horas são cobertos por relógio controlado e testes SQL com serviços externos simulados.

## Variáveis exatas na Vercel

Em **projeto JanjaLive → Settings → Environment Variables**, no ambiente selecionado:

| Variável | Valor |
| --- | --- |
| `DISCORD_CALLS_ENABLED` | `false` durante preparação; `true` ao habilitar a beta |
| `DISCORD_BOT_APPLICATION_ID` | Application ID da aplicação oficial do JanjaLive |
| `DISCORD_BOT_PUBLIC_KEY` | Public Key da mesma aplicação, em General Information |
| `DISCORD_BOT_TOKEN` | Token novo da página Bot, como segredo |
| `DISCORD_CALLS_ORIGIN` | `https://www.janja.live` |

`DISCORD_CALLS_GUILD_ID` não é mais lida: pode ser removida ou mantida sem efeito. Não há variável nova. Não mexer em `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, callback OAuth, `AUTH_SECRET`, TURN ou segredos de tempo real existentes. `REALTIME_PROVIDER` continua `cloudflare`. O Worker recebe o binding SQLite `GUILD_POLICIES` pela configuração versionada; não é um secret para cadastrar no painel.

Usar o token do bot da aplicação oficial, salvo apenas nos segredos da Vercel/arquivo local ignorado pelo Git. Não copiar para uma issue, print ou comando de terminal. O token divulgado da aplicação de teste não será usado nesta integração: invalidá-lo ou excluir a aplicação de teste ao descontinuá-la, sem precisar regenerá-lo para a migração.

## Ordem de entrega

1. Concluir checks e revisar a migração aditiva `drizzle/0008_discord_guild_controls.sql`. Não transformar salas comuns em salas Discord nem executar fixtures no banco de produção.
2. No Developer Portal da aplicação oficial, **Bot → Bot público: desligado → Salvar**. Se o portal rejeitar o link padrão, em **Installation → Install Link** escolher **None**. Manter somente **Guild Install**, scopes `bot` e `applications.commands`, sem User Install.
3. Publicar primeiro o Worker com a migração v2, preservando vars/secrets; depois a web/backend com a migração PostgreSQL pelo prebuild existente. Esperar até 60 segundos para vencerem tokens legados sem guild ID. Não encerrar salas em uso apenas para atualizar o código.
4. Manter as cinco variáveis da integração e a flag `true`. Login OAuth permanece na aplicação oficial atual. Nenhum upgrade de plano é necessário.
5. Registrar explicitamente os dois comandos globais, removendo apenas seus registros locais antigos no servidor de teste:

```powershell
node --env-file=.tooling/discord-call-beta/.env tools/discord-call/register.mjs --remove-guild-commands=1156443434362617927
```

O script verifica identidade do token e Bot público desligado. Faz upsert individual global, somente para servidor, sem substituir comandos não relacionados. O argumento de limpeza é necessário apenas para a migração dos comandos antigos. Novas instalações não exigem outro registro nem uma aprovação no JanjaLive.

6. No [Developer Portal](https://discord.com/developers/applications), na aplicação escolhida → **General Information → Interactions Endpoint URL**:

```text
https://www.janja.live/api/discord/interactions
```

Salvar e confirmar o PING. O endpoint anterior `trycloudflare.com` era só da prova local. Não preencher Event Webhooks URL no lugar desse campo.

7. Permissões do bot: **Ver canais, Conectar, Enviar mensagens, Inserir links e Ler histórico de mensagens**. Deixar intents privilegiadas desligadas; não conceder Administrator, Speak ou Gerenciar mensagens ao bot. Moderadores que executam `/janja-limpar` continuam precisando de Gerenciar mensagens.

Link de instalação privada, usando a conta proprietária da aplicação e escolhendo um servidor onde ela pode instalar apps:

https://discord.com/oauth2/authorize?client_id=1555326263760003112&scope=bot%20applications.commands&permissions=1133568&integration_type=0

Não há `guild_id` ou `disable_guild_select` nesse link. Ele não altera o callback do login. O mesmo link está no botão **Adicionar bot**, em **/admin → Servidores do Discord**, abrindo em nova aba; só a área autenticada do proprietário exibe esse atalho. Após o primeiro `/janja`/acesso verificado, o servidor aparece nessa listagem. Ali é possível buscar, bloquear, desbloquear e concluir uma alteração pendente. Não existe etapa de aprovação.

O build atual do desktop já entende convites `janjalive://room/...`; não foi criado um protocolo alternativo. Os ajustes deste código acrescentam mensagens específicas de falha no desktop. Testar a versão instalada e o build novo antes de decidir se a beta exige atualização do instalador.

## Rodada privada integrada antes de liberar a funcionalidade

1. Em uma call comum do servidor, executar `/janja`; a resposta deve ser privada e oferecer continuação.
2. Abrir sem sessão do JanjaLive, concluir login com a mesma conta e verificar retorno à preparação. Uma conta diferente deve ser recusada.
3. Clicar Continuar e verificar uma única sala/cartão. Repetir o comando e, se possível, usar duas contas ao mesmo tempo; não pode duplicar criação/cota.
4. Continuar pelo navegador e pelo aplicativo instalado. Confirmar que ambos usam as interfaces atuais, que a escolha de fonte continua explícita e que o botão de navegador funciona mesmo sem o desktop instalado.
5. Outra conta ativa na mesma call deve entrar sem aprovação; fora da call deve ser recusada. Tentar pelo link, ID público e código da sala não deve contornar a regra.
6. Revogar um participante e tentar entrar novamente: o bot não deve restaurar o acesso sozinho. Conta banida também não entra. A restauração explícita pelo dono verifica a call do destinatário.
7. Sair do Discord sem fechar o JanjaLive não deve derrubar a sessão já autorizada. Indisponibilidade do Discord deve impedir novas verificações, sem colocar o bot no caminho da mídia existente.
8. Transmitir e assistir em web/desktop numa sala comum e numa sala da beta. Nenhum preset, codec ou rota de mídia foi alterado, mas essa rodada prática continua necessária antes de afirmar ausência de regressões de uso.
9. Encerrar/excluir a sessão: o JanjaLive encerra o acesso independentemente da atualização do cartão. Link antigo deve informar encerramento e não criar outra sala.
10. Conferir latência do primeiro comando e consumo nos painéis Vercel/Cloudflare/Neon, incluindo uso já existente. Nenhum upgrade, fila ou host pago deve ser habilitado automaticamente.

## Desativar e migrar para a aplicação oficial

Para desligar novas operações, definir `DISCORD_CALLS_ENABLED=false` e redeploy. Isso não muda salas comuns. Encerrar as sessões beta em andamento antes de desativar se o objetivo for interrompê-las imediatamente; a flag não é um comando de expulsão de sockets já conectados. Não remover a migração nem campos com o código em uso. Preparações e cards podem exigir limpeza administrativa.

Depois de validar, trocar **somente** `DISCORD_BOT_APPLICATION_ID`, `DISCORD_BOT_PUBLIC_KEY` e `DISCORD_BOT_TOKEN` pelos da aplicação oficial, instalar seu bot no mesmo servidor e registrar `/janja` novamente. Configurar nela o mesmo endpoint HTTP e manter o login `identify` como está. Não alterar credenciais OAuth só porque o bot mudou.

Encerrar as salas criadas pelo bot antigo e remover seus cards/comando antes da troca; IDs de mensagens pertencem ao bot que as publicou. A aplicação nova não pode editar esses cards. Desativar o endpoint antigo e remover o bot de teste quando não for mais necessário.

## Evidência e limites

### Limpar mensagens do bot

`/janja-limpar` apaga apenas mensagens do bot oficial no canal em que foi executado. Requer Gerenciar mensagens (ou Administrador) do usuário, conferido também no backend com as permissões efetivas da interação assinada. O bot precisa de Ver canal e Ler histórico de mensagens; em canal de voz, também Conectar. O bot **não** precisa receber Gerenciar mensagens: são usadas exclusões individuais das próprias mensagens, inclusive antigas, sem bulk delete.

Cada execução consulta no máximo cinco páginas de 100 mensagens e apaga até 20 mensagens, com orçamento de tempo e sem retry automático de HTTP 429. Há limite compartilhado de uma execução por canal a cada 30 segundos e duas por usuário a cada minuto. O resultado é publicado no próprio canal e removido após seis segundos pelo webhook da interação, sem job ou serviço separado. Falta de permissão antes da execução é informada em privado. Se a exclusão da resposta falhar no Discord, ela pode permanecer no canal. O resultado informa progresso parcial; mensagens além das 500 recentes não são alcançadas. Não se trata de uma varredura irrestrita de todo o histórico.

Somente referências de cartões efetivamente apagados são desassociadas no banco, condicionadas a servidor, canal e ID da mensagem. Não são encerradas salas, alterados membros, prazos ou transmissões. O próximo `/janja` pode publicar um novo cartão para a mesma sala ativa. O publicador também detecta HTTP 404/10008 de cartões removidos, recuperando referências antigas inclusive após uma falha de persistência da limpeza. Indisponibilidade/permissão negada não é considerada evidência de exclusão.

Para cartões cujo recibo nunca foi persistido, a limpeza reconhece o link exato da sessão nas mensagens do próprio bot. Quando esgota todo o histórico do canal, também libera reservas sem recibo com mais de um minuto, inclusive de uma limpeza anterior. Não libera essas reservas em varreduras parciais nem libera reservas recentes que podem pertencer a uma publicação em andamento. Essa recuperação altera apenas metadados de publicação.

Registrar explicitamente com `tools/discord-call/register.mjs`, com as variáveis do bot oficial carregadas localmente; o script mantém `/janja` e adiciona `/janja-limpar` sem substituir outros comandos. Não registrar antes de publicar o backend que reconhece o novo comando. Não há serviço novo, polling ou dependência de npm.

### Controle de servidores

No Developer Portal da aplicação oficial, Bot → Public Bot desativado permite apenas ao proprietário instalar o bot. Isso não limita quem usa os comandos depois de instalado. Manter Guild Install e os escopos bot/applications.commands; usar link de autorização sem guild_id e sem disable_guild_select para escolher servidores em que o proprietário tem permissão de instalação. Caso o portal rejeite um link padrão de instalação de aplicação privada, remover o Install Link público na seção Installation e usar o link OAuth2 explícito.

O backend novo aceita instalações verificadas por padrão. O bloqueio de um servidor não altera outro nem salas comuns. Conexões já abertas ficam preservadas; novos comandos, entradas e reconexões são recusados. A recusa é aplicada tanto na emissão da credencial quanto no Worker, usando guild ID assinado. Uma falha de envio da política aparece como confirmação pendente; repetir é seguro e mantém registro da ação. Não marcar uma entrega pendente como bloqueio durável confirmado.

Na aceitação após rollout: instalar o bot privado em um segundo servidor, executar `/janja` sem cadastrar ID algum no JanjaLive, conferir seu aparecimento no admin, bloquear e testar novos comandos/entradas/reconexões. Uma conexão já aberta deve continuar ativa. Conferir em paralelo uma sala comum e uma do primeiro servidor. Desbloquear e confirmar nova entrada, preservando o dono e a sessão reutilizada. O registro global e a nova instalação não foram executados pelos testes locais.

Validação local da expansão em 17/11/2026: 387 testes web/compartilhados/Worker, 78 do desktop e 17 com PostgreSQL real passaram. Lint, typechecks, builds web/desktop e Worker dry-run passaram. HTTP Discord/Worker e registro global são simulados; as transações e a migração PostgreSQL são reais no banco descartável. Interface exercitada por testes de componentes, sem controle do PC do usuário. O servidor descartável foi encerrado ao terminar. Não confundir essa validação com publicação ou instalação real em outro servidor.

Na rodada integrada de 16/11/2026, a conta principal foi operada pelo usuário e a secundária pelo navegador de testes. Aprovação na call errada foi recusada; na correta, aceita. Revogação retirou o acesso e não houve readmissão automática. `/janja-limpar` apagou o cartão sem encerrar a sala/transmissão e seu aviso sumiu após seis segundos; cartões do bot antigo foram apagados manualmente pelo usuário. Uma nova execução recuperou o cartão da mesma sessão. O encerramento da sala retirou o acesso e desativou o cartão. A sala seguinte recebeu nome `teste-janja` e o usuário confirmou abertura com nome/código corretos no desktop.

Foi observada reprodução de vídeo Opera → conta secundária com avanço do tempo de reprodução durante a limpeza. Não foi feita escuta independente do áudio nesta rodada. Uma parada posterior foi confirmada como manual pelo usuário. Os testes SQL usam PostgreSQL real e simulam presença Discord/lifecycle externo; relógio controlado não equivale a manter uma call de produção por seis horas. Resultados finais e links de CI/release devem ser registrados na issue #17.

Não há serviço pago novo; operar gratuitamente continua dependendo das cotas compartilhadas.
