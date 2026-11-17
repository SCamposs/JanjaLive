# ADR 0003 — Instalação privada e bloqueio de servidores

Data: 17/11/2026. Estado: implementação preparada e validada localmente; ativação depende do rollout e da configuração privada no Discord. Substitui apenas a restrição ao servidor beta da ADR 0002.

## Decisão

Todo servidor em que o bot oficial está instalado pode usar a integração, sem lista de aprovação. A aplicação permanece privada no Discord (`bot_public=false`), de modo que o proprietário controla as instalações. A flag geral `DISCORD_CALLS_ENABLED` continua desligada por padrão; `DISCORD_CALLS_GUILD_ID` deixa de ser consumida.

Os comandos globais usam `integration_types: [0]` e `contexts: [0]`: somente instalação em servidor e uso dentro dele. O registro é explícito, nunca em builds nem a cada instalação. O script confirma que o token pertence ao Application ID configurado e que Bot público está desligado antes de registrar. POST individual preserva comandos não relacionados. A limpeza opcional de comandos locais antigos exige um guild ID explícito e remove apenas os dois nomes gerenciados pelo JanjaLive, após sucesso dos globais.

## Instalação e identidade verificadas

A interação continua exigindo a assinatura Ed25519 do corpo original e o Application ID oficial. Contextos de conta pessoal/DM são recusados; quando o Discord inclui `authorizing_integration_owners`, a instalação de servidor precisa corresponder ao guild da interação. O guild ID assinado é propagado à preparação, verificação de voz, nome do canal e criação/reutilização.

Na admissão, o backend consulta o guild com o token do bot oficial, valida ID e nome e verifica a presença real da identidade autenticada naquele guild/canal. Não basta enviar um ID de servidor pelo navegador. A indisponibilidade/permissão negada não libera acesso nem registra metadados não verificados.

Um servidor aparece no admin após o primeiro uso/admissão verificado, sem varredura permanente das instalações. O banco guarda nome, ID, primeiro/último uso, bloqueio e estado de entrega da política. A atualização do nome nunca sobrescreve o bloqueio; o upsert relê o estado para recusar um bloqueio concorrente. A criação SQL também testa o bloqueio para não inserir uma nova sala após ele.

## Bloqueio e sessões existentes

Somente o proprietário autenticado pode pesquisar e bloquear/desbloquear pelo admin web. A listagem tem busca e páginas de 20 registros. Há confirmação ao bloquear, estado de envio, trava contra requisições duplicadas e recuperação explícita de confirmação pendente.

Bloquear recusa novos comandos, preparações/entradas e credenciais de conexão. Conexões já admitidas e transmissões abertas permanecem funcionando. Reabrir/reconectar é uma nova conexão e exige servidor desbloqueado. Autorizações existentes não são apagadas; o dono ainda pode encerrar sua sala pelos controles atuais. O bloqueio de servidor não encerra salas comuns nem muda permissões de conta.

A política também fica em `GuildPolicyDurableObject`, um objeto SQLite por servidor dentro do Worker existente. Uma nova credencial de sala Discord vincula o guild ID na assinatura; o Worker consulta esse controle antes de admitir o socket. Um header forjado não altera a política. Conexões de salas comuns não fazem essa consulta. Nenhum socket existente é fechado pelo objeto de política, e nenhum pacote de mídia passa por ele.

O PostgreSQL persiste a ação e sua auditoria em uma transação antes de enviá-la ao Worker. A data da transição é estritamente crescente. O objeto durável ignora repetições antigas e restauração anterior ao bloqueio mais recente. Falhas mantêm a ação no banco e retornam `DISCORD_GUILD_SYNC_PENDING`; o admin oferece Concluir alteração. Novas admissões já são recusadas pelo banco, embora credenciais emitidas antes da falha só recebam o bloqueio durável após entrega ou vencimento. A confirmação só é limpa se ainda corresponder à mesma transição.

Durante rollout, tokens da 0.1.41 emitidos antes do backend novo ainda não têm guild ID e permanecem compatíveis até seu vencimento de até 60 segundos. Aguardar essa janela antes da aceitação final de bloqueio. Não há emissor novo de credenciais legadas após o rollout completo.

## Admin por ID

IDs são identificadores públicos, não senhas. `requireAdmin()` parte de `auth()` e compara a sessão validada com `ADMIN_USER_ID`; busca o vínculo OAuth persistido no banco e exige `ADMIN_DISCORD_USER_ID` e conta ativa. IDs, nomes, roles e headers fornecidos pelo cliente não concedem acesso. O POST também exige mesma origem, validação estrita do corpo e limite por administrador. A auditoria recebe o ator da sessão, nunca do corpo.

Conhecer um ID não permite produzir a sessão. Comprometer a conta Discord, roubar uma sessão válida ou os segredos de autenticação são riscos distintos e continuam exigindo proteção das credenciais. Nenhuma nova forma de autenticação administrativa foi introduzida.

## Custo e isolamento

Sem dependência npm nova, processo local, Gateway permanente, polling ou plano pago. O objeto adicional usa o backend SQLite disponível no Workers Free e uma leitura por nova conexão Discord, não por frame nem por segundo. As cotas compartilhadas Cloudflare/Neon/Vercel continuam aplicáveis; custo adicional zero não significa consumo ou capacidade ilimitados.

Migração aditiva `0008_discord_guild_controls.sql` cria duas tabelas e índices. A migração v2 do Worker acrescenta o namespace SQLite de políticas sem substituir os namespaces de salas/limites. Captura, codecs, presets e transporte de mídia permanecem iguais. A mensagem de bloqueio é compartilhada com clientes novos; desktop 0.1.41 segue funcional, mas pode exibir uma mensagem genérica ao abrir um link antigo diretamente.

## Validação

Testes de assinatura/contexto e propagação de guild, admissão sem allowlist, bot sem acesso, bloqueio concorrente, recusa de credenciais assinadas em guild bloqueado, política durável e replay, isolamento de salas normais e auditoria/retry. PostgreSQL real exercita SQL/transações, com APIs externas Discord/Worker simuladas. O adaptador de testes aplica o mapeador de resultados da versão instalada do Drizzle, inclusive nos batches. Testes de componentes cobrem confirmação, loading, duplicação e busca. Registro de comandos é executado em processo isolado com HTTP simulado, sem modificar a aplicação oficial.

Uma instalação em um segundo servidor e o fluxo hospedado de bloqueio só podem ser aceitos após configuração e rollout reais. Testes locais não equivalem a essa rodada externa.

## Referências

- https://docs.discord.com/developers/resources/application
- https://docs.discord.com/developers/interactions/application-commands
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/durable-objects/reference/durable-object-migrations/
