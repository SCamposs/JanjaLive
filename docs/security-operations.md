# Segurança na fase de crescimento

## Escopo e orçamento

Este incremento reutiliza PostgreSQL, Worker e GitHub existentes. Não contrata
serviços, não força relay TURN, não grava mídia e não cria polling de métricas.
Verificações e registros pontuais usam cotas dos planos atuais: não são consumo
zero. CodeQL e os runners padrão aqui são destinados ao repositório público;
revise a cobrança antes de torná-lo privado ou usar runners maiores.

Nenhuma assinatura paga, plano superior, log drain, serviço de alertas ou extensão
de retenção de backup foi habilitado. Os preços e limites efetivos devem ser
confirmados no painel de cada conta. Alarmes de consumo não garantem teto de gasto.

## Controles implementados

| Controle | Padrão |
| --- | --- |
| Salas ativas por dono | 5 |
| Criações por conta | 20 em uma janela de 24 horas |
| Membros ativos por sala | 20, incluindo o dono |
| WebSockets por usuário na mesma sala | 3 |
| WebSockets totais por sala | 60 |
| Emissões TURN por usuário, somando salas | 60/hora |
| Emissões de token realtime por usuário | 30/minuto |

Os limites de criação e associação são transações: bloqueiam a linha do dono ou
da sala antes de contar na próxima instrução, em READ COMMITTED. O contador de
criações fica na conta e não diminui quando uma sala é apagada. Contas ou salas
existentes acima dos limites continuam acessíveis; somente novas admissões são
recusadas. Os limites não são por IP para não penalizar uma casa/rede compartilhada.
Não há teto global de sockets por pessoa entre objetos de salas distintos.

As mutações web exigem Origin exato; o cliente desktop continua autenticando com
Bearer. Nenhuma decisão de identidade usa dados enviados como ID pelo navegador.

O banco guarda apenas usuário, identificador revogável, chave de emissão e datas
das credenciais TURN, sem a senha da credencial. A rotina de manutenção remove os
registros expirados. Ban tenta revogar credenciais e sockets independentemente;
uma falha parcial é reportada e pode ser repetida. O cron tenta novamente
credenciais de contas banidas (até 20 contas por execução).

“Sair de todos os dispositivos”, no menu web, invalida sessões web/desktop e
handoffs pendentes, persiste um corte temporal e tenta desconectar sockets e
revogar TURN. Falhas ficam pendentes para a manutenção repetir, sem invalidar
credenciais de uma nova sessão criada depois do corte. Credenciais TURN emitidas
antes deste deploy não têm registro para revogação individual: deixe a janela de
uma hora drenar antes de considerar a cobertura completa.

O contador de espectadores identifica conexões P2P de saída efetivamente
conectadas no cliente transmissor, não quem abriu a sala ou iniciou negociação.
Não é um mecanismo para impedir gravação ou um registro histórico de audiência.

Tokens novos incluem a emissão em milissegundos, assinada e consistente com iat,
para separar um novo login de uma sessão revogada no mesmo segundo. Tokens antigos
continuam aceitos, com precisão conservadora de segundos. O Worker preserva ambos
os protocolos de sinalização.

As dependências com alertas foram atualizadas em conjunto com o lockfile. Consulte
`desktop-security-checklist.md` para as versões. A auditoria sem alertas não
substitui testes dos fluxos da aplicação ou revisão de configurações de produção.

## Variáveis que você configura

Na **Vercel > projeto JanjaLive > Settings > Environment Variables**, Production:

| Variável | Valor normal | Uso |
| --- | --- | --- |
| `ROOM_CREATION_ENABLED` | `true` ou ausente | `false` suspende novas salas |
| `TURN_ENABLED` | `true` ou ausente | `false` suspende novas credenciais TURN |
| `SECURITY_CONTACT_EMAIL` | seu e-mail/alias de atendimento | contato público em `/safety` |

Não use `NEXT_PUBLIC_`. O endereço de contato será exibido publicamente, então
prefira um alias/caixa que você já possui e acompanha. Sem o endereço, a página
explica que o canal está em preparação. As duas flags já têm padrão habilitado;
não é necessário cadastrá-las para manter o funcionamento. Alterações exigem
redeploy da web. Não mova essas variáveis para o desktop.

Em **Cloudflare > Workers & Pages > janjalive-realtime > Settings > Variables and
Secrets**, `REALTIME_CONNECTIONS_ENABLED=true` é o normal, `false` pausa novas
conexões. A configuração versionada está em `wrangler.jsonc`; mantenha o arquivo
e o painel em sincronia. Essa flag não fecha sockets existentes. Use ban/revogação
para contas específicas. Não apague as chaves nem troque para Upstash para pausar.

`TURN_ENABLED=false` deixa STUN disponível: redes restritas podem não conectar.
Não revoga credenciais já emitidas nem garante encerrar alocações TURN existentes.
Revogação do provedor e fechamento P2P precisam ser validados em fluxo real; não
prometemos interrupção instantânea de toda alocação ou de clientes modificados.

## Passos manuais nas contas, sem contratar nada

1. **GitHub, Cloudflare, Vercel, Neon e Discord do operador:** habilite MFA ou
   passkey conforme disponível. Guarde códigos de recuperação fora do computador,
   revise sessões e remova tokens/integrantes antigos. Não envie chaves pelo chat.
2. **GitHub > Settings > Rules > Rulesets:** proteja `main` contra force push e
   exclusão; exija checks do CI, PostgreSQL e CodeQL. Configure isso depois do
   primeiro resultado verde. Defina bypass apenas para o proprietário necessário.
   Em projeto de dono único, não exija aprovação que você mesmo não pode dar.
   `CODEOWNERS` identifica responsáveis, mas sozinho não bloqueia merges.
3. **GitHub > Rulesets:** proteja tags `v*` contra sobrescrita e exclusão e restrinja
   sua criação ao responsável pela release. Revise permissões de Actions e
   credenciais de publicação. Não habilite auto-merge de atualizações de segurança
   sem os checks. Confirme que não existe outro setup CodeQL duplicado.
4. **GitHub > Security:** habilite alertas Dependabot, secret scanning/push
   protection e private vulnerability reporting quando disponíveis gratuitamente.
   O workflow CodeQL e o arquivo Dependabot são versionados neste incremento.
5. **Cloudflare > Realtime/TURN e Workers**, **Vercel > Usage/Logs**, **Neon > Usage**:
   acompanhe consumo, falhas e tendências; use notificações gratuitas disponíveis.
   Comece conferindo diariamente e perto de 50%, 75% e 90% da cota. Não ative
   add-ons pagos para obter esses alertas. O painel `/admin` mostra contadores
   agregados apenas na abertura, sem polling; eles não equivalem a bytes faturados.
6. **Neon:** confira a retenção/recuperação já incluída no seu plano. Faça um backup
   manual com `pg_dump` do PostgreSQL para armazenamento local criptografado, usando
   credenciais de leitura adequadas e sem colocá-las no histórico de comandos.
   Restaure com `pg_restore` em banco local descartável e verifique usuários,
   memberships e migrações. Registre data e resultado. Não crie branch/banco pago
   nem aumente a retenção contratada. Backup inclui dados pessoais e credenciais
   de sessão, portanto restrinja acesso e apague cópias antigas conforme a política.
7. Confirme que o **Vercel Cron existente `/api/cron/rooms`** está executando com
   `CRON_SECRET`. O JSON inclui contagens de revogações pendentes. Não aumente a
   frequência para esta implementação. O valor `pending` exige investigação/retry.
8. Configure e teste o e-mail público, incluindo recebimento. Para exclusão de
   dados, verifique a identidade, revogue acesso e trate os registros associados e
   a retenção de auditoria de forma explícita. Ainda não há exclusão automática
   self-service nem sistema de tickets.
9. No ambiente de desenvolvimento, atualize o Node 22 para pelo menos 22.19
   (preferencialmente o patch LTS atual). O runtime local observado era 22.18,
   abaixo do requisito de uma ferramenta de testes já presente antes deste
   incremento. O CI usa o Node 22 atualizado do runner. Não instale dependências
   a partir de alertas ou links de terceiros; use a distribuição oficial.

Não registrar corpos de requisição, cabeçalhos de autenticação, URLs de convite,
SDP, ICE, áudio ou vídeo. Evite session replay. Logs dos provedores precisam ser
revisados separadamente; a ausência de logs de mídia no código não controla a
retenção da infraestrutura.

## Deploy e validação

1. Deploy do Worker primeiro, preservando seus secrets e ambos os protocolos.
2. Aplique migrações via fluxo normal `prebuild` da Vercel e faça deploy da web.
   As migrações são aditivas; não apagam dados. Preserve o backup anterior.
3. Teste criação/entrada, limites, duas abas, desktop e celular. Faça ban de uma
   conta de teste durante transmissão; valide socket e emissão TURN bloqueados.
4. Teste “Sair de todos” com navegador e desktop abertos; autentique de novo e
   confirme que o cron não encerra a nova sessão. Valide recebimento da denúncia.
5. Publique novo desktop somente após checks e testes de interoperabilidade.

As mudanças do código e documentação não configuram MFA, regras GitHub, alertas,
e-mail ou backups nas suas contas. Testes locais não substituem essas verificações.

## Incidente e retorno

Pause novas salas se houver criação abusiva. Suspenda novas credenciais TURN se
houver consumo anormal, considerando a perda de conectividade em algumas redes.
Bloqueie a conta e repita o ban se houver falha parcial. Para compromissos reais
de secrets, revogue/rotacione apenas os afetados e redeploye em ordem Worker/web.
Não faça rotação periódica sem motivo nem exponha valores nos logs.

Para rollback de interface/API, mantenha as tabelas e colunas novas; são aditivas.
Não apague evidências de auditoria. Um rollback para código antigo remove os
novos limites, portanto prefira manter a criação pausada durante a investigação.

## Testes reproduzíveis

`pnpm test:security-db` usa um PostgreSQL descartável, apontado por
`SECURITY_TEST_POSTGRES_URL`. Só aceita hosts locais e nomes começando com
`janjalive_test`, pois recria o schema. Nunca use DATABASE_URL de produção.
`SECURITY_TEST_PSQL` pode indicar o executável psql; por padrão usa o PATH.
O teste usa o SQL real produzido por Drizzle, transações e clientes psql concorrentes.
O CI disponibiliza um PostgreSQL efêmero para esse job.
