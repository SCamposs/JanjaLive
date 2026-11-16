# Ativação e validação da beta Discord

Preparação da entrega em 16/11/2026: a beta foi implementada e validada localmente; a ativação deve seguir a sequência abaixo. A prova usou uma aplicação separada; por decisão do usuário, a rodada integrada usa a aplicação oficial do JanjaLive. A validação real integrada continua pendente até a rodada privada. Evidências de deploy e ativação são acompanhadas na issue #17.

## Variáveis exatas na Vercel

Em **projeto JanjaLive → Settings → Environment Variables**, somente para o ambiente selecionado para a beta:

| Variável | Valor |
| --- | --- |
| `DISCORD_CALLS_ENABLED` | `false` durante preparação; `true` ao habilitar a beta |
| `DISCORD_CALLS_GUILD_ID` | `1156443434362617927` |
| `DISCORD_BOT_APPLICATION_ID` | Application ID da aplicação oficial do JanjaLive |
| `DISCORD_BOT_PUBLIC_KEY` | Public Key da mesma aplicação, em General Information |
| `DISCORD_BOT_TOKEN` | Token novo da página Bot, como segredo |
| `DISCORD_CALLS_ORIGIN` | `https://www.janja.live` |

Não mexer em `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, callback OAuth, `AUTH_SECRET`, configuração de TURN ou variáveis de tempo real existentes. `REALTIME_PROVIDER` precisa continuar `cloudflare`. Nenhuma variável nova é exigida na Cloudflare para o bot; o Worker precisa receber o código que suporta o prazo opcional das salas temporárias.

Usar o token do bot da aplicação oficial, salvo apenas nos segredos da Vercel/arquivo local ignorado pelo Git. Não copiar para uma issue, print ou comando de terminal. O token divulgado da aplicação de teste não será usado nesta integração: invalidá-lo ou excluir a aplicação de teste ao descontinuá-la, sem precisar regenerá-lo para a migração.

## Ordem de entrega

1. Concluir os checks locais e revisar a migração aditiva `drizzle/0007_discord_call_beta.sql`. A migração cria a tabela de preparações e campos opcionais; não transforma salas comuns em salas Discord.
2. Publicar o Worker com suporte ao prazo assinado antes de habilitar a integração no backend. O payload de conexões comuns permanece compatível com as versões atuais.
3. Entregar a web com a migração e flag `false`, conforme o processo normal de deploy. Não rodar manualmente migrações contra produção como parte de um teste descartável.
4. Configurar as seis variáveis e fazer redeploy com `true` quando iniciar a rodada privada. A restrição de servidor continua válida. Termos/privacidade são gerados conforme essa flag, portanto redeploy é necessário.
5. Registrar explicitamente `/janja` apenas no servidor beta, usando um arquivo local com os segredos corretos:

```powershell
node --env-file=.tooling/discord-call-beta/.env tools/discord-call/register.mjs
```

O script não roda em build, não registra globalmente e não substitui outros comandos.

6. No [Developer Portal](https://discord.com/developers/applications), na aplicação escolhida → **General Information → Interactions Endpoint URL**:

```text
https://www.janja.live/api/discord/interactions
```

Salvar e confirmar o PING. O endpoint anterior `trycloudflare.com` era só da prova local. Não preencher Event Webhooks URL no lugar desse campo.

7. Manter instalação somente de servidor, scopes `bot` e `applications.commands`, permissões View Channels, Connect, Send Messages e Embed Links. Deixar intents privilegiadas desligadas; não conceder Administrator ou Speak.

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

## Evidência local e limites

### Limpar mensagens do bot

`/janja-limpar` apaga apenas mensagens do bot oficial no canal em que foi executado. Requer Gerenciar mensagens (ou Administrador) do usuário, conferido também no backend com as permissões efetivas da interação assinada. O bot precisa de Ver canal e Ler histórico de mensagens; em canal de voz, também Conectar. O bot **não** precisa receber Gerenciar mensagens: são usadas exclusões individuais das próprias mensagens, inclusive antigas, sem bulk delete.

Cada execução consulta no máximo cinco páginas de 100 mensagens e apaga até 20 mensagens, com orçamento de tempo e sem retry automático de HTTP 429. Há limite compartilhado de uma execução por canal a cada 30 segundos e duas por usuário a cada minuto. O resultado é publicado no próprio canal e removido após seis segundos pelo webhook da interação, sem job ou serviço separado. Falta de permissão antes da execução é informada em privado. Se a exclusão da resposta falhar no Discord, ela pode permanecer no canal. O resultado informa progresso parcial; mensagens além das 500 recentes não são alcançadas. Não se trata de uma varredura irrestrita de todo o histórico.

Somente referências de cartões efetivamente apagados são desassociadas no banco, condicionadas a servidor, canal e ID da mensagem. Não são encerradas salas, alterados membros, prazos ou transmissões. O próximo `/janja` pode publicar um novo cartão para a mesma sala ativa. O publicador também detecta HTTP 404/10008 de cartões removidos, recuperando referências antigas inclusive após uma falha de persistência da limpeza. Indisponibilidade/permissão negada não é considerada evidência de exclusão.

Para cartões cujo recibo nunca foi persistido, a limpeza reconhece o link exato da sessão nas mensagens do próprio bot. Quando esgota todo o histórico do canal, também libera reservas sem recibo com mais de um minuto, inclusive de uma limpeza anterior. Não libera essas reservas em varreduras parciais nem libera reservas recentes que podem pertencer a uma publicação em andamento. Essa recuperação altera apenas metadados de publicação.

Registrar explicitamente com `tools/discord-call/register.mjs`, com as variáveis do bot oficial carregadas localmente; o script mantém `/janja` e adiciona `/janja-limpar` sem substituir outros comandos. Não registrar antes de publicar o backend que reconhece o novo comando. Não há serviço novo, polling ou dependência de npm.

### Próxima expansão: instalação privada em outros servidores

No Developer Portal da aplicação oficial, Bot → Public Bot desativado permite apenas ao proprietário instalar o bot. Isso não limita quem usa os comandos depois de instalado. Manter Guild Install e os escopos bot/applications.commands; usar link de autorização sem guild_id e sem disable_guild_select para escolher servidores em que o proprietário tem permissão de instalação. Caso o portal rejeite um link padrão de instalação de aplicação privada, remover o Install Link público na seção Installation e usar o link OAuth2 explícito.

**O backend atual continua restrito ao servidor beta por código e variável.** Alterar somente DISCORD_CALLS_GUILD_ID ou desativar Public Bot não habilita outro servidor. Antes da expansão, substituir essa fixação por uma lista explícita de servidores permitidos, propagar guildId pelas verificações de presença/preparações e registrar ambos os comandos nos servidores autorizados (ou globalmente com contexto apenas Guild após validação). Recomenda-se manter instalação privada + lista permitida, sem abrir automaticamente a qualquer servidor nem alterar o aplicativo OAuth existente.

Até esta etapa: 314 testes da suíte web/compartilhada/Worker, 78 do desktop e 12 com PostgreSQL local passaram. Builds web/desktop, typechecks e Worker dry-run passaram. Um servidor local com o build de produção também confirmou: início/privacidade com HTTP 200, APIs de sala sem autenticação com HTTP 401 e novas rotas Discord com HTTP 404 enquanto a flag está desligada. A rodada SQL usa PostgreSQL real com presença Discord simulada. A rodada Discord anterior foi real, mas ainda sem OAuth e salas integrados. Nenhum desses resultados equivale à rodada privada acima.

Não publicar como funcionalidade validada ponta a ponta até concluir essa rodada integrada. Não há serviço pago novo; operar gratuitamente continua dependendo das cotas compartilhadas.
